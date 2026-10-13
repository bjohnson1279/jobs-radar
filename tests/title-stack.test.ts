import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings, validateConfig } from '../src/config/loader.ts';
import { createTitleFilters } from '../src/domain/filters.ts';
import { createRanker } from '../src/domain/ranking.ts';
import type { JobPosting } from '../src/domain/types.ts';

test('explicit mismatched title stacks are excluded even alongside preferred stacks', () => {
    const matches = createTitleFilters(settings);
    for (const stack of ['Kotlin', 'Java', 'Python', 'Ruby on Rails', 'C#', '.NET', 'ASP.NET', 'Go', 'Rust', 'C++']) {
        assert.equal(matches(`Senior Software Engineer - ${stack}`), false, stack);
        assert.equal(matches(`Senior Node.js / ${stack} Software Engineer`), false, stack);
    }
    for (const stack of ['Node.js', 'TypeScript', 'PHP', 'React', 'Angular', 'JavaScript']) {
        assert.equal(matches(`Senior Software Engineer - ${stack}`), true, stack);
    }
});

test('cached mismatches are hidden without deleting history; description mentions remain eligible', () => {
    const job: JobPosting & { appliedAt: string } = {
        id: 'kotlin', title: 'Senior Software Engineer - Kotlin', company: 'Example',
        url: 'https://example.com/job', location: 'Remote - US', description: 'TypeScript Node.js',
        isRemote: true, isLocal: false, locationScore: 0, score: 100, appliedAt: '2026-01-01T00:00:00Z',
    };
    const ranked = createRanker(settings)([job, { ...job, id: 'node', title: 'Senior Software Engineer', description: 'Node.js services integrate with Kotlin systems.' }]);
    assert.deepEqual(ranked.map(item => item.id), ['node']);
    assert.equal(job.appliedAt, '2026-01-01T00:00:00Z');
    const changed = structuredClone(settings);
    changed.roles.excludeTitleStackPattern = '';
    assert.equal(createRanker(changed)([job]).length, 1);
    changed.roles.excludeTitleStackPattern = '[';
    assert.throws(() => validateConfig(changed), /excludeTitleStackPattern: invalid regular expression/);
});
