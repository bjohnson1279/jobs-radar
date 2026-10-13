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
