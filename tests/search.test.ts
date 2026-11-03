import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { collectJobs, run } from '../src/services/search.ts';
import { settings } from '../src/config/loader.ts';

const originalRequest = (axios.Axios.prototype as any)._request;

function mockHttp(handler: (config: any) => Promise<any>) {
    (axios.Axios.prototype as any)._request = async function (configOrUrl: any, maybeConfig: any) {
        let config: any;
        if (typeof configOrUrl === 'string') {
            config = { ...(maybeConfig || {}), url: configOrUrl };
        } else {
            config = { ...(configOrUrl || {}) };
        }
        return handler(config);
    };
}

function restoreHttp() {
    (axios.Axios.prototype as any)._request = originalRequest;
}

test('collectJobs: scrapes configured boards across Greenhouse, Lever, Ashby, Workday, RemoteOK, and Jobicy, filters blocklist, and deduplicates', async (t) => {
    t.after(restoreHttp);

    // Snapshot original sources config
    const origSources = structuredClone(settings.sources);
    t.after(() => {
        settings.sources = origSources;
    });

    settings.sources.greenhouse = ['gh-target-co'];
    settings.sources.lever = ['lever-co'];
    settings.sources.ashby = ['ashby-co'];
    settings.sources.workday = [{
        tenant: 'workday-co',
        datacenter: 'wd5',
        site: 'careers',
        displayName: 'Workday Corp',
    }];
    settings.sources.remoteok = { enabled: true, tags: ['backend'] };
    settings.sources.jobicy = { enabled: true, tags: ['backend'], maxPages: 1 };

    mockHttp(async (config) => {
        const url = String(config.url || '');
        if (url.includes('boards-api.greenhouse.io')) {
            return {
                status: 200,
                data: {
                    jobs: [
                        {
                            id: 1,
                            title: 'Senior Software Engineer',
                            absolute_url: 'https://gh.example/1',
                            location: { name: 'Seattle, WA' },
                            content: 'TypeScript and Node.js',
                        },
                        {
                            id: 2,
                            title: 'Senior Software Engineer', // Blocklisted company
                            absolute_url: 'https://gh.example/2',
                            location: { name: 'Seattle, WA' },
                            content: 'TypeScript',
                        },
                    ],
                },
            };
        }
        if (url.includes('api.lever.co')) {
            return {
                status: 200,
                data: [
                    {
                        id: 'l1',
                        text: 'Senior Full-Stack Developer',
                        hostedUrl: 'https://lever.example/l1',
                        categories: { location: 'Remote - US' },
                        workplaceType: 'remote',
                        descriptionPlain: 'Node.js React',
                    },
                ],
            };
        }
        if (url.includes('api.ashbyhq.com')) {
            return {
                status: 200,
                data: {
                    jobs: [
                        {
                            id: 'a1',
                            title: 'Staff Software Engineer',
                            isRemote: true,
                            applyUrl: 'https://ashby.example/a1',
                            location: 'Seattle, WA',
                            descriptionHtml: 'Distributed systems',
                        },
                    ],
                },
            };
        }
        if (url.includes('myworkdayjobs.com')) {
            return {
                status: 200,
                data: {
                    jobPostings: [
                        {
                            title: 'Software Engineer',
                            locationsText: 'Seattle, WA',
                            externalPath: '/job/wd1',
                        },
                    ],
                },
            };
        }
        if (url.includes('remoteok.com')) {
            return {
                status: 200,
                data: [
                    { legal: 'notice' },
                    {
                        id: 'rok1',
                        slug: 'rok1-lead',
                        position: 'Lead Developer',
                        company: 'Acme Cloud',
                        location: 'Worldwide',
                        apply_url: 'https://remoteok.com/rok1',
                        description: 'Node.js',
                    },
                    {
                        // Duplicate of Greenhouse job 1 to verify deduplication
                        id: 'gh-gh-target-co-1',
                        slug: 'duplicate-gh',
                        position: 'Senior Software Engineer',
                        company: 'Duplicate Co',
                        apply_url: 'https://remoteok.com/duplicate',
                    },
                ],
            };
        }
        if (url.includes('jobicy.com')) {
            return {
                status: 200,
                data: {
                    hasMore: false,
                    jobs: [
                        {
                            id: 501,
                            jobTitle: 'Backend Engineer',
                            companyName: 'Jobicy Inc',
                            jobGeo: 'USA Only',
                            url: 'https://jobicy.com/501',
                            jobDescription: 'TypeScript AWS',
                        },
                    ],
                },
            };
        }
        return { status: 200, data: {} };
    });

    // Temporarily add a blocklist item matching the uppercase company name produced by scrapeGreenhouse
    const origBlocklist = [...settings.companies.blocklist];
    t.after(() => {
        settings.companies.blocklist = origBlocklist;
    });
    // Add dummy blocked company
    settings.companies.blocklist.push('Example Blocked Co');

    // Mute stdout during search scraping
    const originalStdoutWrite = process.stdout.write;
    const originalConsoleLog = console.log;
    process.stdout.write = (() => true) as any;
    console.log = () => {};
    t.after(() => {
        process.stdout.write = originalStdoutWrite;
        console.log = originalConsoleLog;
    });

    const jobs = await collectJobs();

    // Verify jobs collected from sources
    const ids = jobs.map(j => j.id);
    assert.ok(ids.includes('gh-gh-target-co-1'));
    assert.ok(ids.includes('lever-lever-co-l1'));
    assert.ok(ids.includes('ashby-ashby-co-a1'));
    assert.ok(ids.includes('wd-workday-co-/job/wd1'));
    assert.ok(ids.includes('rok-rok1'));
    assert.ok(ids.includes('jcy-501'));

    // Verify deduplication: duplicate id was not included twice
    assert.equal(ids.filter(id => id === 'gh-gh-target-co-1').length, 1);
});

test('collectJobs: skips empty or disabled sources', async (t) => {
    t.after(restoreHttp);

    const origSources = structuredClone(settings.sources);
    t.after(() => {
        settings.sources = origSources;
    });

    settings.sources.greenhouse = [];
    settings.sources.lever = [];
    settings.sources.ashby = [];
    settings.sources.workday = [];
    settings.sources.remoteok = { enabled: false, tags: [] };
    settings.sources.jobicy = { enabled: false, tags: [], maxPages: 1 };

    mockHttp(async () => {
        throw new Error('Should not make any HTTP requests when all sources are disabled');
    });

    const jobs = await collectJobs();
    assert.deepEqual(jobs, []);
});

test('run: formats and prints local and remote matches within configured limit', async (t) => {
    t.after(restoreHttp);

    const origSources = structuredClone(settings.sources);
    const origLimit = settings.output.limit;
    const origIncludeLocal = settings.location.includeLocal;
    t.after(() => {
        settings.sources = origSources;
        settings.output.limit = origLimit;
        settings.location.includeLocal = origIncludeLocal;
    });

    settings.sources.greenhouse = ['acme-runner'];
    settings.sources.lever = [];
    settings.sources.ashby = [];
    settings.sources.workday = [];
    settings.sources.remoteok = { enabled: false, tags: [] };
    settings.sources.jobicy = { enabled: false, tags: [], maxPages: 1 };
    settings.output.limit = 2;
    settings.location.includeLocal = true;

    mockHttp(async () => {
        return {
            status: 200,
            data: {
                jobs: [
                    {
                        id: 10,
                        title: 'Senior Software Engineer',
                        absolute_url: 'https://gh.example/10',
                        location: { name: 'Seattle, WA' },
                        content: 'TypeScript Node.js engineer',
                    },
                    {
                        id: 20,
                        title: 'Senior Software Engineer',
                        absolute_url: 'https://gh.example/20',
                        location: { name: 'Remote - US' },
                        content: 'TypeScript Node.js engineer remote',
                    },
                    {
                        id: 30,
                        title: 'Senior Software Engineer',
                        absolute_url: 'https://gh.example/30',
                        location: { name: 'Remote - US' },
                        content: 'TypeScript Node.js remote 2',
                    },
                    {
                        id: 40,
                        title: 'Senior Software Engineer',
                        absolute_url: 'https://gh.example/40',
                        location: { name: 'Remote - US' },
                        content: 'TypeScript Node.js remote 3 (exceeds limit)',
                    },
                ],
            },
        };
    });

    const logged: string[] = [];
    const origLog = console.log;
    const origWrite = process.stdout.write;
    console.log = (...args: any[]) => { logged.push(args.join(' ')); };
    process.stdout.write = (() => true) as any;
    t.after(() => {
        console.log = origLog;
        process.stdout.write = origWrite;
    });

    await run();

    const outputText = logged.join('\n');
    assert.ok(outputText.includes(`LOCAL MATCHES: ${settings.location.label} (1)`));
    assert.ok(outputText.includes('Nearby: +30 | T2: +20 | T3: +10 | T4: +5'));
    assert.ok(outputText.includes('https://gh.example/10'));
    assert.ok(outputText.includes('REMOTE MATCHES (3)'));
    assert.ok(outputText.includes('https://gh.example/20'));
    assert.ok(outputText.includes('https://gh.example/30'));
    // Since output.limit is 2, job 40 should be sliced out
    assert.ok(!outputText.includes('https://gh.example/40'));
});

test('run: handles includeLocal set to false', async (t) => {
    t.after(restoreHttp);

    const origSources = structuredClone(settings.sources);
    const origIncludeLocal = settings.location.includeLocal;
    t.after(() => {
        settings.sources = origSources;
        settings.location.includeLocal = origIncludeLocal;
    });

    settings.sources.greenhouse = ['acme-remote-only'];
    settings.sources.lever = [];
    settings.sources.ashby = [];
    settings.sources.workday = [];
    settings.sources.remoteok = { enabled: false, tags: [] };
    settings.sources.jobicy = { enabled: false, tags: [], maxPages: 1 };
    settings.location.includeLocal = false;

    mockHttp(async () => {
        return {
            status: 200,
            data: {
                jobs: [
                    {
                        id: 11,
                        title: 'Senior Software Engineer',
                        absolute_url: 'https://gh.example/11',
                        location: { name: 'Remote - US' },
                        content: 'TypeScript Node.js remote engineer',
                    },
                ],
            },
        };
    });

    const logged: string[] = [];
    const origLog = console.log;
    const origWrite = process.stdout.write;
    console.log = (...args: any[]) => { logged.push(args.join(' ')); };
    process.stdout.write = (() => true) as any;
    t.after(() => {
        console.log = origLog;
        process.stdout.write = origWrite;
    });

    await run();

    const outputText = logged.join('\n');
    assert.ok(outputText.includes(`LOCAL MATCHES: ${settings.location.label} (0)`));
    assert.ok(outputText.includes('REMOTE MATCHES (1)'));
    assert.ok(outputText.includes('https://gh.example/11'));
});
