import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

test('server includes security headers in HTTP responses', async (t) => {
    const testPort = 3199;
    process.env.PORT = String(testPort);
    process.env.JOBS_RADAR_DATA_FILE = fileURLToPath(new URL('./fixtures/test-jobs.json', import.meta.url));

    const { server } = await import('../src/entrypoints/server.ts');
    t.after(() => {
        server.close();
    });

    const response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
    assert.equal(response.status, 200);

    const headers = response.headers;
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(headers.get('content-security-policy'), "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");

    // Prototype property lookup returns 404 instead of throwing unhandled server error
    const protoResponse = await fetch(`http://127.0.0.1:${testPort}/toString`);
    assert.equal(protoResponse.status, 404);

    // Oversized application payload returns 413
    const largeBody = JSON.stringify({ id: 'test-id', applied: true, extra: 'x'.repeat(5000) });
    const payloadResponse = await fetch(`http://127.0.0.1:${testPort}/api/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
        body: largeBody,
    });
    assert.equal(payloadResponse.status, 413);
});
