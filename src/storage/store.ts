import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JobPosting } from '../domain/types.ts';

export interface TrackedJob extends JobPosting {
    firstSeenAt: string;
    lastSeenAt: string;
    appliedAt: string | null;
    inLatestSearch: boolean;
}
interface Snapshot { version: 1; updatedAt: string | null; jobs: TrackedJob[] }

// Single-server store. Serialize mutations and replace the file atomically.
export async function openStore(path: string) {
    let state: Snapshot = { version: 1, updatedAt: null, jobs: [] };
    try {
        const saved = JSON.parse(await readFile(path, 'utf8'));
        if (saved.version !== 1 || !Array.isArray(saved.jobs) || saved.jobs.some((job: TrackedJob) =>
            typeof job.id !== 'string' || typeof job.firstSeenAt !== 'string' || typeof job.lastSeenAt !== 'string')) {
            throw new Error('Invalid Jobs Radar store; preserve the file and restore a backup.');
        }
        state = saved;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    let queue = Promise.resolve();
    function mutate(change: (next: Snapshot) => void): Promise<void> {
        const operation = queue.then(async () => {
            const next = structuredClone(state);
            change(next);
            await mkdir(dirname(path), { recursive: true });
            const temporary = `${path}.${randomUUID()}.tmp`;
            await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8');
            await rename(temporary, path);
            state = next;
        });
        queue = operation.catch(() => {});
        return operation;
    }
    return {
        snapshot: () => structuredClone(state),
        recordSearch: (jobs: JobPosting[], now = new Date().toISOString()) => mutate(next => {
            next.jobs.forEach(job => { job.inLatestSearch = false; });
            for (const job of jobs) {
                const previous = next.jobs.find(saved => saved.id === job.id);
                const tracked: TrackedJob = {
                    ...job, postedAt: job.postedAt ?? previous?.postedAt ?? null,
                    firstSeenAt: previous?.firstSeenAt ?? now, lastSeenAt: now,
                    appliedAt: previous?.appliedAt ?? null, inLatestSearch: true,
                };
                if (previous) Object.assign(previous, tracked);
                else next.jobs.push(tracked);
            }
            next.updatedAt = now;
        }),
        setApplied: (id: string, appliedAt: string | null) => mutate(next => {
            const job = next.jobs.find(job => job.id === id);
            if (!job) throw new Error('Unknown job');
            job.appliedAt = appliedAt;
        }),
    };
}
