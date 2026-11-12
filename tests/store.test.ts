import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openStore } from '../src/storage/store.ts';
import { deduplicateJobs } from '../src/presentation/output.ts';
import type { JobPosting } from '../src/domain/types.ts';

const job: JobPosting = {
    id: 'gh-example-1', title: 'Senior Software Engineer', company: 'Example', url: 'https://example.com/1',
    location: 'Seattle, WA', description: 'TypeScript', isRemote: false, isLocal: true, locationScore: 30, score: 85,
    postedAt: '2026-09-01T00:00:00.000Z',
};

test('history and applications survive refresh, disappearance, and restart', async () => {
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    const directory = await mkdtemp(join(process.cwd(), 'data', 'test-'));
    try {
        const path = join(directory, 'jobs.json');
        let store = await openStore(path);
        assert.equal(store.has(job.id), false);
        await store.recordSearch([job], '2026-10-01T00:00:00.000Z');
        assert.equal(store.has(job.id), true);
        assert.equal(store.has('non-existent-id'), false);
        await Promise.all([
            store.setApplied(job.id, '2026-10-02T00:00:00.000Z'),
            store.recordSearch([{ ...job, postedAt: null }], '2026-10-03T00:00:00.000Z'),
        ]);
        store = await openStore(path);
        assert.equal(store.has(job.id), true);
        assert.equal(store.has('gh-example-2'), false);
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

        // Store corruption/invalid schema checks
        await writeFile(path, JSON.stringify({ version: 2, updatedAt: null, jobs: [] }));
        await assert.rejects(openStore(path), /Invalid Jobs Radar store/);

        await writeFile(path, JSON.stringify({ version: 1, updatedAt: null, jobs: 'not-an-array' }));
        await assert.rejects(openStore(path), /Invalid Jobs Radar store/);

        await writeFile(path, JSON.stringify({
            version: 1,
            updatedAt: null,
            jobs: [{ id: 123, firstSeenAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-01T00:00:00Z' }],
        }));
        await assert.rejects(openStore(path), /Invalid Jobs Radar store/);

        await writeFile(path, JSON.stringify({
            version: 1,
            updatedAt: null,
            jobs: [{ id: 'valid-id', firstSeenAt: null, lastSeenAt: '2026-10-01T00:00:00Z' }],
        }));
        await assert.rejects(openStore(path), /Invalid Jobs Radar store/);

        await writeFile(path, JSON.stringify({
            version: 1,
            updatedAt: null,
            jobs: [{ id: 'valid-id', firstSeenAt: '2026-10-01T00:00:00Z', lastSeenAt: undefined }],
        }));
        await assert.rejects(openStore(path), /Invalid Jobs Radar store/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('store isolates cloned salary metadata and serializes concurrent mutations', async () => {
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    const directory = await mkdtemp(join(process.cwd(), 'data', 'test-store-concurrency-'));
    try {
        const path = join(directory, 'jobs.json');
        const store = await openStore(path);

        const jobWithMetadata: JobPosting = {
            id: 'gh-meta-1',
            title: 'Senior Full Stack Engineer',
            company: 'Meta Corp',
            url: 'https://example.com/meta',
            location: 'Remote',
            description: 'TypeScript',
            isRemote: true,
            isLocal: false,
            locationScore: 0,
            score: 90,
            _salary: { min: 140000, max: 180000 },
            _ashbyCompensation: { min: 145000, max: 185000 },
        };

        // Record initial job
        await store.recordSearch([jobWithMetadata], '2026-10-10T00:00:00.000Z');

        // Verify cloned metadata objects do not leak reference to external modifications
        const snap1 = store.snapshot();
        assert.equal(snap1.jobs.length, 1);
        assert.deepEqual(snap1.jobs[0]._salary, { min: 140000, max: 180000 });
        assert.deepEqual(snap1.jobs[0]._ashbyCompensation, { min: 145000, max: 185000 });

        // Mutating the snapshot object locally must not affect the store or subsequent snapshots
        if (snap1.jobs[0]._salary) {
            snap1.jobs[0]._salary.min = 999999;
        }
        if (snap1.jobs[0]._ashbyCompensation) {
            snap1.jobs[0]._ashbyCompensation.max = 999999;
        }

        const snap2 = store.snapshot();
        assert.equal(snap2.jobs[0]._salary?.min, 140000);
        assert.equal(snap2.jobs[0]._ashbyCompensation?.max, 185000);

        // Concurrent mutations test: queue serialization ensures all mutations apply deterministically
        const mutationPromises: Promise<void>[] = [];
        for (let i = 1; i <= 5; i++) {
            mutationPromises.push(
                store.recordSearch([
                    {
                        ...jobWithMetadata,
                        id: `gh-concurrent-${i}`,
                    },
                ], `2026-10-10T00:00:0${i}.000Z`)
            );
        }

        await Promise.all(mutationPromises);

        // Store must contain all 5 newly added jobs plus the initial job (6 total)
        const finalSnap = store.snapshot();
        assert.equal(finalSnap.jobs.length, 6);
        for (let i = 1; i <= 5; i++) {
            assert.ok(finalSnap.jobs.some(j => j.id === `gh-concurrent-${i}`));
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
