import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('server includes security headers in HTTP responses and handles API contracts and edge cases', async (t) => {
    const testPort = 3199;
    process.env.PORT = String(testPort);

    const tempDir = await mkdtemp(join(tmpdir(), 'jobs-radar-server-test-'));
    const tempStorePath = join(tempDir, 'test-jobs.json');
    const initialData = {
        version: 1,
        updatedAt: '2026-10-01T12:00:00.000Z',
        jobs: [
            {
                id: 'job-1',
                title: 'Senior Software Engineer',
                company: 'Acme Corp',
                url: 'https://example.com/job-1',
                location: 'Remote - US',
                description: 'TypeScript Node.js engineer',
                isRemote: true,
                isLocal: false,
                locationScore: 0,
                score: 80,
                firstSeenAt: '2026-10-01T12:00:00.000Z',
                lastSeenAt: '2026-10-01T12:00:00.000Z',
                appliedAt: null,
                inLatestSearch: true,
            },
        ],
    };
    await writeFile(tempStorePath, JSON.stringify(initialData, null, 2), 'utf8');
    process.env.JOBS_RADAR_DATA_FILE = tempStorePath;

    const { server } = await import('../src/entrypoints/server.ts');
    t.after(async () => {
        server.close();
        await rm(tempDir, { recursive: true, force: true });
    });

    const baseUrl = `http://127.0.0.1:${testPort}`;

    // 1. Health check & security headers
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { status: 'ok' });

    const headers = healthRes.headers;
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(headers.get('content-security-policy'), "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");

    // 2. Static file serving and 404 handling
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type') || '', /^text\/html; charset=utf-8/);

    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type') || '', /^text\/javascript; charset=utf-8/);

    const cssRes = await fetch(`${baseUrl}/style.css`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') || '', /^text\/css; charset=utf-8/);

    // Prototype property lookup returns 404 instead of throwing unhandled server error
    const protoResponse = await fetch(`${baseUrl}/toString`);
    assert.equal(protoResponse.status, 404);
    assert.deepEqual(await protoResponse.json(), { error: 'Not found' });

    // Method mismatch on health check returns 404
    const postHealthRes = await fetch(`${baseUrl}/api/health`, { method: 'POST' });
    assert.equal(postHealthRes.status, 404);

    // Method mismatch on application returns 404
    const getAppRes = await fetch(`${baseUrl}/api/application`, { method: 'GET' });
    assert.equal(getAppRes.status, 404);

    // 3. GET /api/jobs contract
    const jobsRes = await fetch(`${baseUrl}/api/jobs`);
    assert.equal(jobsRes.status, 200);
    const jobsData = await jobsRes.json();
    assert.ok(jobsData.profile);
    assert.equal(typeof jobsData.profile.locationLabel, 'string');
    assert.ok(Array.isArray(jobsData.jobs));
    assert.equal(jobsData.jobs.length, 1);
    assert.equal(jobsData.jobs[0].id, 'job-1');
    assert.equal(jobsData.updatedAt, '2026-10-01T12:00:00.000Z');
    assert.equal(jobsData.refreshing, false);
    assert.equal(jobsData.error, null);

    // 4. POST /api/refresh contract & header checks
    const badRefreshRes = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'wrong-header' },
    });
    assert.equal(badRefreshRes.status, 403);
    assert.deepEqual(await badRefreshRes.json(), { error: 'Invalid refresh request' });

    const goodRefreshRes = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'refresh' },
    });
    assert.equal(goodRefreshRes.status, 202);
    assert.deepEqual(await goodRefreshRes.json(), { refreshing: true });

    // 5. POST /api/application contract & edge cases
    // Missing / invalid auth header
    const noHeaderAppRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'job-1', applied: true }),
    });
    assert.equal(noHeaderAppRes.status, 403);
    assert.deepEqual(await noHeaderAppRes.json(), { error: 'Invalid application request' });

    // Oversized payload returns 413
    const largeBody = JSON.stringify({ id: 'test-id', applied: true, extra: 'x'.repeat(5000) });
    const payloadResponse = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: largeBody,
    });
    assert.equal(payloadResponse.status, 413);
    assert.deepEqual(await payloadResponse.json(), { error: 'Request too large' });

    // Invalid JSON body
    const invalidJsonRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: '{not-json',
    });
    assert.equal(invalidJsonRes.status, 400);
    assert.deepEqual(await invalidJsonRes.json(), { error: 'Invalid JSON' });

    // Missing id or applied boolean
    const missingFieldsRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1' }),
    });
    assert.equal(missingFieldsRes.status, 400);
    assert.deepEqual(await missingFieldsRes.json(), { error: 'id and applied are required' });

    const nonBoolAppliedRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1', applied: 'true' }),
    });
    assert.equal(nonBoolAppliedRes.status, 400);
    assert.deepEqual(await nonBoolAppliedRes.json(), { error: 'id and applied are required' });

    // Unknown job ID returns 404
    const unknownJobRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'non-existent-id', applied: true }),
    });
    assert.equal(unknownJobRes.status, 404);
    assert.deepEqual(await unknownJobRes.json(), { error: 'Unknown job' });

    // Future application date returns 400
    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const futureDateRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1', applied: true, appliedAt: futureDate }),
    });
    assert.equal(futureDateRes.status, 400);
    assert.deepEqual(await futureDateRes.json(), { error: 'Application date must be valid and not in the future' });

    // Invalid date string returns 400
    const invalidDateRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1', applied: true, appliedAt: 'invalid-date' }),
    });
    assert.equal(invalidDateRes.status, 400);
    assert.deepEqual(await invalidDateRes.json(), { error: 'Application date must be valid and not in the future' });

    // Valid applied: true with explicit past date relative to current time returns 200
    const validPastDate = new Date(Date.now() - 86400000).toISOString();
    const applyRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1', applied: true, appliedAt: validPastDate }),
    });
    assert.equal(applyRes.status, 200);
    assert.deepEqual(await applyRes.json(), { saved: true });

    // Verify application status reflected in /api/jobs
    const updatedJobsRes1 = await fetch(`${baseUrl}/api/jobs`);
    const updatedJobsData1 = await updatedJobsRes1.json();
    assert.equal(updatedJobsData1.jobs[0].appliedAt, validPastDate);

    // Valid applied: false unsets appliedAt
    const unapplyRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1', applied: false }),
    });
    assert.equal(unapplyRes.status, 200);
    assert.deepEqual(await unapplyRes.json(), { saved: true });

    const updatedJobsRes2 = await fetch(`${baseUrl}/api/jobs`);
    const updatedJobsData2 = await updatedJobsRes2.json();
    assert.equal(updatedJobsData2.jobs[0].appliedAt, null);

    // Valid applied: true without appliedAt defaults to now
    const applyDefaultRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'job-1', applied: true }),
    });
    assert.equal(applyDefaultRes.status, 200);
    assert.deepEqual(await applyDefaultRes.json(), { saved: true });

    const updatedJobsRes3 = await fetch(`${baseUrl}/api/jobs`);
    const updatedJobsData3 = await updatedJobsRes3.json();
    assert.ok(updatedJobsData3.jobs[0].appliedAt);
});
