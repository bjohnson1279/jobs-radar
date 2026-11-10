import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import http from 'node:http';

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
    assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(headers.get('content-security-policy'), "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'");
    assert.equal(headers.get('permissions-policy'), 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');

    // Method Not Allowed (405) with Allow header on GET-only /api/health
    const healthPostRes = await fetch(`${baseUrl}/api/health`, { method: 'POST' });
    assert.equal(healthPostRes.status, 405);
    assert.equal(healthPostRes.headers.get('allow'), 'GET');
    assert.deepEqual(await healthPostRes.json(), { error: 'Method Not Allowed' });

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

    // Method Not Allowed (405) with Allow header on GET-only /api/jobs
    const jobsPostRes = await fetch(`${baseUrl}/api/jobs`, { method: 'POST' });
    assert.equal(jobsPostRes.status, 405);
    assert.equal(jobsPostRes.headers.get('allow'), 'GET');
    assert.deepEqual(await jobsPostRes.json(), { error: 'Method Not Allowed' });

    // 3. POST /api/refresh
    // Rejects missing or invalid header with 403
    const refreshNoHeaderRes = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
    assert.equal(refreshNoHeaderRes.status, 403);
    const refreshNoHeaderJson = await refreshNoHeaderRes.json();
    assert.equal(refreshNoHeaderJson.error, 'Invalid refresh request');

    // Origin header validation on mutating requests (defense against cross-origin CSRF)
    const originForbiddenRes = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'refresh', 'Origin': 'http://evil.com' },
    });
    assert.equal(originForbiddenRes.status, 403);
    assert.deepEqual(await originForbiddenRes.json(), { error: 'Invalid Origin header' });

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

    // Accepts valid origin header with 202
    const refreshValidOriginRes = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'refresh', 'Origin': `http://127.0.0.1:${testPort}` },
    });
    assert.equal(refreshValidOriginRes.status, 202);

    // Method Not Allowed (405) with Allow header on POST-only /api/refresh
    const refreshGetRes = await fetch(`${baseUrl}/api/refresh`, { method: 'GET' });
    assert.equal(refreshGetRes.status, 405);
    assert.equal(refreshGetRes.headers.get('allow'), 'POST');
    assert.deepEqual(await refreshGetRes.json(), { error: 'Method Not Allowed' });

    // 4. POST /api/application
    // Rejects untrusted or null origin header with 403
    const appOriginNullRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: {
            'X-Jobs-Radar': 'application',
            'Content-Type': 'application/json',
            'Origin': 'null',
        },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true }),
    });
    assert.equal(appOriginNullRes.status, 403);
    assert.deepEqual(await appOriginNullRes.json(), { error: 'Invalid Origin header' });

    // Rejects missing header with 403
    const appNoHeaderRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true }),
    });
    assert.equal(appNoHeaderRes.status, 403);
    assert.equal((await appNoHeaderRes.json()).error, 'Invalid application request');

    // Rejects missing or non-application/json Content-Type with 415
    const appNoContentTypeRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true }),
    });
    assert.equal(appNoContentTypeRes.status, 415);
    assert.equal((await appNoContentTypeRes.json()).error, 'Content-Type must be application/json');

    const appWrongContentTypeRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true }),
    });
    assert.equal(appWrongContentTypeRes.status, 415);
    assert.equal((await appWrongContentTypeRes.json()).error, 'Content-Type must be application/json');

    // Rejects payload larger than 4096 bytes with 413
    const largeBody = JSON.stringify({ id: 'gh-acme-101', applied: true, extra: 'x'.repeat(5000) });
    const appLargeRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: largeBody,
    });
    assert.equal(appLargeRes.status, 413);

    // Rejects invalid JSON with 400
    const appBadJsonRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: '{ invalid json }',
    });
    assert.equal(appBadJsonRes.status, 400);
    assert.equal((await appBadJsonRes.json()).error, 'Invalid JSON');

    // Rejects missing schema fields (missing id or non-boolean applied) with 400
    const appMissingIdRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: JSON.stringify({ applied: true }),
    });
    assert.equal(appMissingIdRes.status, 400);
    assert.equal((await appMissingIdRes.json()).error, 'id and applied are required');

    const appNonBoolAppliedRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: 'true' }),
    });
    assert.equal(appNonBoolAppliedRes.status, 400);

    // Rejects future or invalid appliedAt timestamp with 400
    const appFutureDateRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true, appliedAt: '2099-01-01T00:00:00.000Z' }),
    });
    assert.equal(appFutureDateRes.status, 400);
    assert.equal((await appFutureDateRes.json()).error, 'Application date must be valid and not in the future');

    const appInvalidDateRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true, appliedAt: 'invalid-date' }),
    });
    assert.equal(appInvalidDateRes.status, 400);

    // Rejects unknown job id with 404
    const appUnknownJobRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'unknown-id-123', applied: true }),
    });
    assert.equal(appUnknownJobRes.status, 404);
    assert.equal((await appUnknownJobRes.json()).error, 'Unknown job');

    // Successfully records application with valid past date (supports charset in Content-Type)
    const appSuccessRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: true, appliedAt: '2026-09-02T00:00:00.000Z' }),
    });
    assert.equal(appSuccessRes.status, 200);
    assert.deepEqual(await appSuccessRes.json(), { saved: true });

    // Successfully clears application status when applied: false
    const appClearRes = await fetch(`${baseUrl}/api/application`, {
        method: 'POST',
        headers: { 'X-Jobs-Radar': 'application', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'gh-acme-101', applied: false }),
    });
    assert.equal(appClearRes.status, 200);
    assert.deepEqual(await appClearRes.json(), { saved: true });

    // Method Not Allowed (405) with Allow header on POST-only /api/application
    const appGetRes = await fetch(`${baseUrl}/api/application`, { method: 'GET' });
    assert.equal(appGetRes.status, 405);
    assert.equal(appGetRes.headers.get('allow'), 'POST');
    assert.deepEqual(await appGetRes.json(), { error: 'Method Not Allowed' });

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

    // Method Not Allowed (405) with Allow header on static assets
    const staticPostRes = await fetch(`${baseUrl}/app.js`, { method: 'POST' });
    assert.equal(staticPostRes.status, 405);
    assert.equal(staticPostRes.headers.get('allow'), 'GET');
    assert.deepEqual(await staticPostRes.json(), { error: 'Method Not Allowed' });

    const notFoundRes = await fetch(`${baseUrl}/api/unknown-endpoint`);
    assert.equal(notFoundRes.status, 404);
    assert.equal((await notFoundRes.json()).error, 'Not found');

    // Malformed request targets and proxy-style non-origin paths return 400 Bad Request
    const malformedStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: testPort, path: 'http://[' }, (res) => {
            resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
    });
    assert.equal(malformedStatus, 400);

    const nonOriginStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: testPort, path: 'http://evil.com/api/jobs' }, (res) => {
            resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
    });
    assert.equal(nonOriginStatus, 400);

    // Protocol-relative and backslash request targets return 400 Bad Request
    const protocolRelativeStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: testPort, path: '//attacker.com/api/jobs' }, (res) => {
            resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
    });
    assert.equal(protocolRelativeStatus, 400);

    const backslashPathStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: testPort, path: '/\\attacker.com' }, (res) => {
            resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
    });
    assert.equal(backslashPathStatus, 400);

    // Host header validation tests (defense against DNS rebinding)
    const requestWithHost = (hostHeader: string | undefined, path = '/api/jobs') =>
        new Promise<{ status: number; body: any }>((resolve, reject) => {
            const headers: Record<string, string> = {};
            if (hostHeader !== undefined) headers.host = hostHeader;
            const req = http.request({
                host: '127.0.0.1',
                port: testPort,
                path,
                headers,
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed: any;
                    try { parsed = JSON.parse(data); } catch { parsed = data; }
                    resolve({ status: res.statusCode ?? 0, body: parsed });
                });
            });
            req.on('error', reject);
            req.end();
        });

    // Rejects unauthorized external hosts with 403 Forbidden
    const rebindRes = await requestWithHost('attacker.com');
    assert.equal(rebindRes.status, 403);
    assert.deepEqual(rebindRes.body, { error: 'Invalid Host header' });

    const subRebindRes = await requestWithHost('localhost.attacker.com:3199');
    assert.equal(subRebindRes.status, 403);
    assert.deepEqual(subRebindRes.body, { error: 'Invalid Host header' });

    // Rejects malformed host headers with 400 Bad Request
    const userinfoHostRes = await requestWithHost('localhost@attacker.com');
    assert.equal(userinfoHostRes.status, 400);
    assert.deepEqual(userinfoHostRes.body, { error: 'Invalid Host header' });

    const pathHostRes = await requestWithHost('localhost/evil');
    assert.equal(pathHostRes.status, 400);
    assert.deepEqual(pathHostRes.body, { error: 'Invalid Host header' });

    // Accepts valid local host headers
    const validLocalhostRes = await requestWithHost(`localhost:${testPort}`, '/api/health');
    assert.equal(validLocalhostRes.status, 200);
    assert.deepEqual(validLocalhostRes.body, { status: 'ok' });

    const validIpv6Res = await requestWithHost(`[::1]:${testPort}`, '/api/health');
    assert.equal(validIpv6Res.status, 200);
    assert.deepEqual(validIpv6Res.body, { status: 'ok' });
});
