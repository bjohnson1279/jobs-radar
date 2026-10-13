import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openStore } from '../src/storage/store.ts';
import { sourceDate } from '../src/domain/dates.ts';
import { deduplicateJobs } from '../src/presentation/output.ts';
import type { JobPosting } from '../src/domain/types.ts';

const job: JobPosting = {
    id: 'gh-example-1', title: 'Senior Software Engineer', company: 'Example', url: 'https://example.com/1',
    location: 'Seattle, WA', description: 'TypeScript', isRemote: false, isLocal: true, locationScore: 30, score: 85,
    postedAt: '2026-09-01T00:00:00.000Z',
};

test('dates reject invalid or missing values and preserve publication timestamps', () => {
    assert.equal(sourceDate(undefined), null);
    assert.equal(sourceDate('2 days ago'), null);
    assert.equal(sourceDate('2026-02-30'), null);
    assert.equal(sourceDate('2026-09-01'), '2026-09-01T00:00:00.000Z');
    assert.equal(sourceDate('2026-09-01T12:00:00-06:00'), '2026-09-01T18:00:00.000Z');
});

test('history and applications survive refresh, disappearance, and restart', async () => {
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    const directory = await mkdtemp(join(process.cwd(), 'data', 'test-'));
    try {
        const path = join(directory, 'jobs.json');
        let store = await openStore(path);
        await store.recordSearch([job], '2026-10-01T00:00:00.000Z');
        await Promise.all([
            store.setApplied(job.id, '2026-10-02T00:00:00.000Z'),
            store.recordSearch([{ ...job, postedAt: null }], '2026-10-03T00:00:00.000Z'),
        ]);
        store = await openStore(path);
        let saved = store.snapshot().jobs[0];
        assert.equal(saved.firstSeenAt, '2026-10-01T00:00:00.000Z');
        assert.equal(saved.lastSeenAt, '2026-10-03T00:00:00.000Z');
        assert.equal(saved.appliedAt, '2026-10-02T00:00:00.000Z');
        assert.equal(saved.postedAt, job.postedAt);
        await store.recordSearch([], '2026-10-04T00:00:00.000Z');
        saved = store.snapshot().jobs[0];
        assert.equal(saved.inLatestSearch, false);
        assert.equal(saved.lastSeenAt, '2026-10-03T00:00:00.000Z');
        assert.equal(saved.appliedAt, '2026-10-02T00:00:00.000Z');
        await store.setApplied(job.id, null);
        await assert.rejects(store.setApplied('unknown', null), /Unknown job/);
        await store.recordSearch([job, { ...job, id: 'gh-example-2' }], '2026-10-05T00:00:00.000Z');
        store = await openStore(path);
        assert.equal(store.snapshot().jobs.length, 2);
        assert.equal(store.snapshot().jobs[0].appliedAt, null);
        assert.equal(store.snapshot().jobs[1].firstSeenAt, '2026-10-05T00:00:00.000Z');
        assert.equal(store.snapshot().jobs[1].appliedAt, null);
        assert.equal(deduplicateJobs([job, { ...job, id: 'gh-example-2' }, job]).length, 2);
        const before = await readFile(path, 'utf8');
        await writeFile(path, '{invalid');
        await assert.rejects(openStore(path));
        assert.equal(await readFile(path, 'utf8'), '{invalid');
        assert.ok(before.includes('firstSeenAt'));
    } finally { await rm(directory, { recursive: true, force: true }); }
});
