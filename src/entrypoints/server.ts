import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { collectJobs } from '../services/search.ts';
import { rankJobs } from '../domain/ranking.ts';
import { openStore } from '../storage/store.ts';
import { fileURLToPath } from 'node:url';
import { sourceDate } from '../domain/dates.ts';
import { settings } from '../config/loader.ts';

const store = await openStore(process.env.JOBS_RADAR_DATA_FILE ?? fileURLToPath(new URL('../../data/jobs.json', import.meta.url)));
let refresh: Promise<void> | null = null;
let error: string | null = null;
const assets: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'],
};

export const server = createServer(async (req, res) => {
    // Defense-in-depth HTTP security headers to protect local application data and browser features
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
    };
    try {
        if (url.pathname === '/api/health' && req.method === 'GET') {
            json(200, { status: 'ok' });
        } else if (url.pathname === '/api/jobs' && req.method === 'GET') {
            const saved = store.snapshot();
            json(200, { profile: { ...settings.profile, locationLabel: settings.location.label, country: settings.location.country.name, includeLocal: settings.location.includeLocal, includeRemote: settings.location.includeRemote }, jobs: rankJobs(saved.jobs), updatedAt: saved.updatedAt, refreshing: !!refresh, error });
        } else if (url.pathname === '/api/refresh' && req.method === 'POST') {
            if (req.headers['x-jobs-radar'] !== 'refresh') { json(403, { error: 'Invalid refresh request' }); return; }
            if (!refresh) {
                error = null;
                refresh = collectJobs().then(result => store.recordSearch(result))
                    .catch(() => { error = 'Search failed. Try refreshing again.'; })
                    .finally(() => { refresh = null; });
            }
            json(202, { refreshing: true });
        } else if (url.pathname === '/api/application' && req.method === 'POST') {
            if (req.headers['x-jobs-radar'] !== 'application') { json(403, { error: 'Invalid application request' }); return; }
            let body = '';
            for await (const chunk of req) {
                if (body.length + chunk.length > 4096) { json(413, { error: 'Request too large' }); return; }
                body += chunk.toString();
            }
            let input;
            try { input = JSON.parse(body); } catch { json(400, { error: 'Invalid JSON' }); return; }
            if (!input || typeof input.id !== 'string' || typeof input.applied !== 'boolean') {
                json(400, { error: 'id and applied are required' }); return;
            }
            const appliedAt = input.applied ? (input.appliedAt === undefined ? new Date().toISOString() : sourceDate(input.appliedAt)) : null;
            if (input.applied && (!appliedAt || Date.parse(appliedAt) > Date.now())) {
                json(400, { error: 'Application date must be valid and not in the future' }); return;
            }
            if (!store.snapshot().jobs.some(job => job.id === input.id)) { json(404, { error: 'Unknown job' }); return; }
            await store.setApplied(input.id, appliedAt);
            json(200, { saved: true });
        } else if (req.method === 'GET' && Object.hasOwn(assets, url.pathname)) {
            const [file, type] = assets[url.pathname];
            const body = await readFile(new URL(`../../web/${file}`, import.meta.url));
            res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body);
        } else { json(404, { error: 'Not found' }); }
    } catch { json(500, { error: 'Unable to serve request' }); }
});

let port = Number(process.env.PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
}
const host = process.env.HOST ?? '127.0.0.1';
server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && !process.env.PORT && port < 3200) {
        port += 1;
        server.listen(port, host);
    } else {
        console.error(`Unable to start Jobs Radar on port ${port}: ${error.message}`);
        process.exitCode = 1;
    }
});
server.on('listening', () => console.log(`Jobs Radar: http://${host}:${port}`));
server.listen(port, host);
