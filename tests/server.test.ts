import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('server endpoints, security headers, validation, and static files', async (t) => {
    const testPort = 3199;
    process.env.PORT = String(testPort);

    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    const directory = await mkdtemp(join(process.cwd(), 'data', 'test-server-'));
    const tempStorePath = join(directory, 'jobs.json');

    const fixturePath = fileURLToPath(new URL('./fixtures/test-jobs.json', import.meta.url));
    const initialFixtureData = await readFile(fixturePath, 'utf8');
    await writeFile(tempStorePath, initialFixtureData, 'utf8');

    process.env.JOBS_RADAR_DATA_FILE = tempStorePath;

    const { server } = await import('../src/entrypoints/server.ts');
    t.after(async () => {
        server.close();
        await rm(directory, { recursive: true, force: true });
    });

    const baseUrl = `http://127.0.0.1:${testPort}`;

    // 1. Health check & security headers
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.deepEqual(healthJson, { status: 'ok' });

    const headers = healthRes.headers;
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(headers.get('content-security-policy'), "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");

    // Prototype property lookup returns 404
    const protoResponse = await fetch(`${baseUrl}/toString`);
    assert.equal(protoResponse.status, 404);

    // 2. GET /api/jobs (Initial state)
    const jobsRes = await fetch(`${baseUrl}/api/jobs`);
    assert.equal(jobsRes.status, 200);
    const jobsJson = await jobsRes.json();
    assert.ok(jobsJson.profile);
    assert.ok(Array.isArray(jobsJson.jobs));
    assert.equal(jobsJson.jobs.length, 1);
    assert.equal(jobsJson.jobs[0].id, 'gh-acme-101');
    assert.equal(jobsJson.refreshing, false);
    assert.equal(jobsJson.error, null);

    // 3. POST /api/refresh
    // Rejects missing or invalid header with 403
    const refreshNoHeaderRes = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
    assert.equal(refreshNoHeaderRes.status, 403);
    const refreshNoHeaderJson = await refreshNoHeaderRes.json();
    assert.equal(refreshNoHeaderJson.error, 'Invalid refresh request');

    // Accepts valid header with 202
    const refreshRes = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'refresh' },
    });
    assert.equal(refreshRes.status, 202);
    const refreshJson = await refreshRes.json();
    assert.equal(refreshJson.refreshing, true);

    // Subsequent refresh while active also returns 202
    const refreshSecondRes = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'refresh' },
    });
    assert.equal(refreshSecondRes.status, 202);

    // 4. POST /api/application
    // Rejects missing header with 403
    const appNoHeaderRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        body: JSON.stringify({ id: 'gh-acme-101', applied: true }),
    });
    assert.equal(appNoHeaderRes.status, 403);
    assert.equal((await appNoHeaderRes.json()).error, 'Invalid application request');

    // Rejects payload larger than 4096 bytes with 413
    const largeBody = JSON.stringify({ id: 'gh-acme-101', applied: true, extra: 'x'.repeat(5000) });
    const appLargeRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: largeBody,
    });
    assert.equal(appLargeRes.status, 413);

    // Rejects invalid JSON with 400
    const appBadJsonRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: '{ invalid json }',
    });
    assert.equal(appBadJsonRes.status, 400);
    assert.equal((await appBadJsonRes.json()).error, 'Invalid JSON');

    // Rejects missing schema fields (missing id or non-boolean applied) with 400
    const appMissingIdRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ applied: true }),
    });
    assert.equal(appMissingIdRes.status, 400);
    assert.equal((await appMissingIdRes.json()).error, 'id and applied are required');

    const appNonBoolAppliedRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: 'true' }),
    });
    assert.equal(appNonBoolAppliedRes.status, 400);

    // Rejects future or invalid appliedAt timestamp with 400
    const appFutureDateRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true, appliedAt: '2099-01-01T00:00:00.000Z' }),
    });
    assert.equal(appFutureDateRes.status, 400);
    assert.equal((await appFutureDateRes.json()).error, 'Application date must be valid and not in the future');

    const appInvalidDateRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true, appliedAt: 'invalid-date' }),
    });
    assert.equal(appInvalidDateRes.status, 400);

    // Rejects unknown job id with 404
    const appUnknownJobRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'unknown-id-123', applied: true }),
    });
    assert.equal(appUnknownJobRes.status, 404);
    assert.equal((await appUnknownJobRes.json()).error, 'Unknown job');

    // Successfully records application with valid past date
    const appSuccessRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true, appliedAt: '2026-09-02T00:00:00.000Z' }),
    });
    assert.equal(appSuccessRes.status, 200);
    assert.deepEqual(await appSuccessRes.json(), { saved: true });

    // Successfully clears application status when applied: false
    const appClearRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: false }),
    });
    assert.equal(appClearRes.status, 200);
    assert.deepEqual(await appClearRes.json(), { saved: true });

    // 5. Static file serving & unknown routes
    const indexRes = await fetch(`${baseUrl}/`);
    assert.equal(indexRes.status, 200);
    assert.ok((indexRes.headers.get('content-type') ?? '').includes('text/html'));

    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert.equal(jsRes.status, 200);
    assert.ok((jsRes.headers.get('content-type') ?? '').includes('text/javascript'));

    const cssRes = await fetch(`${baseUrl}/style.css`);
    assert.equal(cssRes.status, 200);
    assert.ok((cssRes.headers.get('content-type') ?? '').includes('text/css'));

    const notFoundRes = await fetch(`${baseUrl}/api/unknown-endpoint`);
    assert.equal(notFoundRes.status, 404);
    assert.equal((await notFoundRes.json()).error, 'Not found');
});
