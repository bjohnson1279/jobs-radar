import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankJobs } from '../src/domain/ranking.ts';
import type { JobPosting } from '../src/domain/types.ts';

const job: JobPosting = {
    id: '1', title: 'Senior Software Engineer', company: 'Example', url: 'https://example.com/jobs/1',
    location: 'Remote - US', description: '<p>TypeScript Node.js fast-paced</p>',
    isRemote: true, isLocal: false, locationScore: 0, score: 999,
};

test('web ranking recomputes scores, exposes pros and cons, and filters eligibility', () => {
    const result = rankJobs([
        job,
        { ...job, id: '2', company: 'Example Engineering', location: 'Seattle, WA', locationScore: 30, isLocal: true },
        { ...job, id: '3', company: 'Example Blocked Company' },
        { ...job, id: '4', location: 'Boston, MA', isRemote: false },
    ]);
    assert.deepEqual(result.map(item => item.id), ['2', '1']);
    assert.equal(result[0].score, 58);
    assert.equal(result[1].score, 30);
    assert.equal(result[1].description, ' TypeScript Node.js fast-paced ');
    assert.ok(result[0].pros.some(signal => signal.label === 'Target company' && signal.points === 25));
    assert.ok(result[0].cons.some(signal => signal.label === 'Fast-paced environment' && signal.points === -25));
});

test('formatJob renders consistent output with precomputed reasons, without precomputed reasons, and handles salary', async () => {
    const { formatJob } = await import('../src/presentation/output.ts');
    const [topJob] = rankJobs([
        { ...job, id: '2', company: 'Example Engineering', location: 'Seattle, WA', locationScore: 30, isLocal: true, description: 'TypeScript Node.js fast-paced Salary: $120,000 - $180,000' }
    ]);

    const formattedRanked = formatJob(topJob);
    assert.match(formattedRanked, /\[\d+\/100\] Example Engineering - Senior Software Engineer/);
    assert.match(formattedRanked, /\$120k-\$180k/);
    assert.match(formattedRanked, /Nearby/);
    assert.ok(formattedRanked.includes('Target company +12.5'));

    // Test unranked job without precomputed reasons
    const unrankedJob = {
        id: 'unranked-1',
        title: topJob.title,
        company: topJob.company,
        url: topJob.url,
        location: topJob.location,
        description: topJob.description,
        score: topJob.score,
        isLocal: topJob.isLocal,
        isRemote: topJob.isRemote,
        locationScore: topJob.locationScore,
    };
    const formattedUnranked = formatJob(unrankedJob);
    assert.equal(formattedUnranked, formattedRanked);

    // Test job without salary
    const noSalaryJob = { ...unrankedJob, description: 'TypeScript Node.js' };
    const formattedNoSalary = formatJob(noSalaryJob);
    assert.ok(!formattedNoSalary.includes('$'));
});
