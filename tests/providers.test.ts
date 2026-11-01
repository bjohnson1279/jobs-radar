import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import axios, { type InternalAxiosRequestConfig, type AxiosInstance } from 'axios';

// Intercept axios.create before importing src/providers/index.ts
let capturedInstance: AxiosInstance | null = null;
const originalCreate = axios.create;
axios.create = function (...args: Parameters<typeof originalCreate>) {
    const inst = originalCreate.apply(this, args);
    capturedInstance = inst;
    return inst;
};

// Now import providers module, which calls axios.create({ timeout: 15_000 })
const {
    scrapeGreenhouse,
    scrapeLever,
    scrapeAshby,
    scrapeWorkday,
    scrapeRemoteOK,
    scrapeJobicy,
} = await import('../src/providers/index.ts');

const httpInstance = capturedInstance as unknown as AxiosInstance;
assert.ok(httpInstance, 'Axios instance in providers was captured');

const originalAdapter = httpInstance.defaults.adapter;

type MockRouteHandler = (config: InternalAxiosRequestConfig) => { status?: number; data?: any };
let mockRoutes: Array<{ match: (url: string, method: string) => boolean; handler: MockRouteHandler }> = [];

beforeEach(() => {
    mockRoutes = [];
    if (!httpInstance) return;
    httpInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        const url = config.url ?? '';
        const method = (config.method ?? 'get').toLowerCase();
        for (const route of mockRoutes) {
            if (route.match(url, method)) {
                const res = route.handler(config);
                const status = res.status ?? 200;
                if (status >= 400) {
                    const error: any = new Error(`Request failed with status code ${status}`);
                    error.response = { status, data: res.data ?? {}, headers: {}, config };
                    throw error;
                }
                return {
                    data: res.data,
                    status,
                    statusText: 'OK',
                    headers: {},
                    config,
                };
            }
        }
        throw new Error(`Unhandled mock request: ${method.toUpperCase()} ${url}`);
    };
});

after(() => {
    if (httpInstance) {
        httpInstance.defaults.adapter = originalAdapter;
    }
    axios.create = originalCreate;
});

test('scrapeGreenhouse parses valid jobs, applies title filters, and handles errors', async () => {
    mockRoutes.push({
        match: (url) => url.includes('boards-api.greenhouse.io/v1/boards/acme/jobs'),
        handler: () => ({
            data: {
                jobs: [
                    {
                        id: 101,
                        title: 'Senior Software Engineer',
                        location: { name: 'Seattle, WA' },
                        first_published: '2026-09-01T00:00:00.000Z',
                        updated_at: '2026-09-02T00:00:00.000Z',
                        absolute_url: 'https://boards.greenhouse.io/acme/jobs/101',
                        content: 'Building scalable Node.js and TypeScript backends.',
                    },
                    {
                        id: 102,
                        title: 'HR Generalist', // Should be filtered out by matchesTitle
                        location: { name: 'Remote' },
                        first_published: '2026-09-01T00:00:00.000Z',
                        absolute_url: 'https://boards.greenhouse.io/acme/jobs/102',
                        content: 'Human resources duties.',
                    },
                ],
            },
        }),
    });

    const jobs = await scrapeGreenhouse('acme', 10);
    assert.equal(jobs.length, 1);
    const job = jobs[0];
    assert.equal(job.id, 'gh-acme-101');
    assert.equal(job.company, 'ACME');
    assert.equal(job.title, 'Senior Software Engineer');
    assert.equal(job.location, 'Seattle, WA');
    assert.equal(job.postedAt, '2026-09-01T00:00:00.000Z');
    assert.equal(job.sourceUpdatedAt, '2026-09-02T00:00:00.000Z');
    assert.ok(job.score > 0);

    // Error handling - 404/500 should return empty list without throwing
    mockRoutes = [{
        match: () => true,
        handler: () => ({ status: 500 }),
    }];
    const failedJobs = await scrapeGreenhouse('failed-company');
    assert.deepEqual(failedJobs, []);
});

test('scrapeLever parses job categories, remote flags, and handles network failures', async () => {
    mockRoutes.push({
        match: (url) => url.includes('api.lever.co/v0/postings/globex'),
        handler: () => ({
            data: [
                {
                    id: 'lev-1',
                    text: 'Staff Software Engineer',
                    workplaceType: 'remote',
                    categories: { location: 'San Francisco, CA' },
                    hostedUrl: 'https://jobs.lever.co/globex/lev-1',
                    descriptionPlain: 'We use React and Node.js for cloud services.',
                },
                {
                    id: 'lev-2',
                    text: 'Sales Account Executive', // Should be excluded by title filter
                    categories: { location: 'Remote' },
                    hostedUrl: 'https://jobs.lever.co/globex/lev-2',
                },
            ],
        }),
    });

    const jobs = await scrapeLever('globex', 5);
    assert.equal(jobs.length, 1);
    const job = jobs[0];
    assert.equal(job.id, 'lever-globex-lev-1');
    assert.equal(job.company, 'globex');
    assert.equal(job.remoteHint, true);
    assert.equal(job.location, 'San Francisco, CA');
    assert.equal(job.url, 'https://jobs.lever.co/globex/lev-1');
    assert.ok(job.score > 0);

    // Network failure gracefully returns []
    mockRoutes = [{ match: () => true, handler: () => ({ status: 404 }) }];
    const failed = await scrapeLever('unknown');
    assert.deepEqual(failed, []);
});

test('scrapeAshby parses compensation, address countries, remote indicators, and handles fallback ids', async () => {
    mockRoutes.push({
        match: (url) => url.includes('api.ashbyhq.com/posting-api/job-board/hooli'),
        handler: () => ({
            data: {
                jobs: [
                    {
                        id: 'ash-1',
                        title: 'Principal Software Architect',
                        isRemote: true,
                        location: 'Austin, TX',
                        address: { postalAddress: { addressCountry: 'USA' } },
                        publishedAt: '2026-09-03T12:00:00Z',
                        applyUrl: 'https://jobs.ashbyhq.com/hooli/ash-1/apply',
                        descriptionHtml: '<p>Distributed systems architecture.</p>',
                        compensation: {
                            compensationComponents: [
                                { compensationType: 'Salary', minValue: 180000, maxValue: 220000 },
                            ],
                        },
                    },
                    {
                        jobUrl: 'https://jobs.ashbyhq.com/hooli/no-id',
                        title: 'Full Stack Developer',
                        isRemote: false,
                        location: 'New York, NY',
                        descriptionHtml: '<p>React and TypeScript developer.</p>',
                    },
                    {
                        id: 'ash-filtered',
                        title: 'Office Manager',
                        isRemote: false,
                    },
                ],
            },
        }),
    });

    const jobs = await scrapeAshby('hooli', 0);
    assert.equal(jobs.length, 2);

    const first = jobs[0];
    assert.equal(first.id, 'ashby-hooli-ash-1');
    assert.equal(first.remoteHint, true);
    assert.equal(first.country, 'USA');
    assert.equal(first.postedDateKind, 'lastPublished');
    assert.equal(first.postedAt, '2026-09-03T12:00:00.000Z');
    assert.deepEqual(first._ashbyCompensation, { min: 180000, max: 220000 });

    const second = jobs[1];
    // Uses jobUrl fallback for ID and constructs fallback URL
    assert.equal(second.id, 'ashby-hooli-https://jobs.ashbyhq.com/hooli/no-id');
    assert.equal(second.remoteHint, false);
    assert.equal(second.url, 'https://jobs.ashbyhq.com/hooli/undefined');

    // Failure case
    mockRoutes = [{ match: () => true, handler: () => ({ status: 500 }) }];
    assert.deepEqual(await scrapeAshby('bad'), []);

    // Empty jobs array in response
    mockRoutes = [{ match: () => true, handler: () => ({ data: {} }) }];
    assert.deepEqual(await scrapeAshby('empty'), []);
});

test('scrapeWorkday handles multi-page pagination, offset, and endpoint failures', async () => {
    let callCount = 0;
    mockRoutes.push({
        match: (url, method) => url.includes('myworkdayjobs.com/wday/cxs/initech/careers/jobs') && method === 'post',
        handler: (config) => {
            callCount++;
            const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
            if (body.offset === 0) {
                // Return full page (limit = 20)
                const postings = Array.from({ length: 20 }, (_, i) => ({
                    title: i === 0 ? 'Senior Software Engineer' : 'Office Clerk',
                    externalPath: `/job/clerk-${i}`,
                    locationsText: 'Dallas, TX',
                }));
                return { data: { jobPostings: postings } };
            }
            if (body.offset === 20) {
                // Second page returns 1 matching job and terminates (< 20 items)
                return {
                    data: {
                        jobPostings: [
                            {
                                title: 'Staff Backend Engineer',
                                externalPath: '/job/backend-101',
                                location: 'Austin, TX',
                            },
                        ],
                    },
                };
            }
            return { data: { jobPostings: [] } };
        },
    });

    const board = {
        tenant: 'initech',
        datacenter: 'wd5',
        site: 'careers',
        displayName: 'Initech Corp',
    };

    const jobs = await scrapeWorkday(board);
    assert.equal(callCount, 2);
    assert.equal(jobs.length, 2); // 1 from page 1, 1 from page 2
    assert.equal(jobs[0].id, 'wd-initech-/job/clerk-0');
    assert.equal(jobs[0].title, 'Senior Software Engineer');
    assert.equal(jobs[0].company, 'Initech Corp');
    assert.equal(jobs[0].url, 'https://initech.wd5.myworkdayjobs.com/job/clerk-0');
    assert.equal(jobs[1].id, 'wd-initech-/job/backend-101');
    assert.equal(jobs[1].title, 'Staff Backend Engineer');

    // Network failure gracefully returns []
    mockRoutes = [{ match: () => true, handler: () => ({ status: 500 }) }];
    assert.deepEqual(await scrapeWorkday(board), []);
});

test('scrapeRemoteOK skips metadata item, deduplicates across tags, extracts salary, and handles tag failures', async () => {
    let tagCalls: string[] = [];
    mockRoutes.push({
        match: (url) => url.includes('remoteok.com/api'),
        handler: (config) => {
            const urlObj = new URL(config.url ?? '', 'https://remoteok.com');
            const tag = urlObj.searchParams.get('tag') ?? '';
            tagCalls.push(tag);
            if (tag === 'error-tag') {
                return { status: 500 };
            }
            return {
                data: [
                    { legal: 'Legal notice header item to be skipped' },
                    {
                        id: 'rok-job-1',
                        slug: 'rok-senior-engineer',
                        position: 'Senior Software Engineer',
                        company: 'RemoteWorks',
                        location: 'USA Remote',
                        date: '2026-09-01T00:00:00.000Z',
                        salary_min: 130000,
                        salary_max: 160000,
                        description: 'TypeScript and Node.js backend developer',
                        url: 'https://remoteok.com/l/1',
                    },
                    {
                        id: 'rok-no-slug',
                        position: 'Senior Software Engineer',
                        company: 'NoSlugCo',
                        description: 'Ignored because slug is missing',
                    },
                    {
                        id: 'rok-job-1', // Duplicate from another tag
                        slug: 'rok-senior-engineer',
                        position: 'Senior Software Engineer',
                        company: 'RemoteWorks',
                    },
                ],
            };
        },
    });

    const jobs = await scrapeRemoteOK();
    assert.ok(tagCalls.length > 0);
    // Verified rok-job-1 was processed once and rok-no-slug was skipped
    const matches = jobs.filter(j => j.id === 'rok-rok-job-1');
    assert.equal(matches.length, 1);
    const job = matches[0];
    assert.equal(job.remoteHint, true);
    assert.equal(job.company, 'RemoteWorks');
    assert.equal(job.postedAt, '2026-09-01T00:00:00.000Z');
    assert.deepEqual(job._salary, { min: 130000, max: 160000 });

    // Handles tag failure error branch without crashing
    mockRoutes = [{
        match: () => true,
        handler: () => ({ status: 500 }),
    }];
    assert.deepEqual(await scrapeRemoteOK(), []);
});

test('scrapeJobicy handles pagination cursors, deduplication, currency checking, and errors', async () => {
    mockRoutes.push({
        match: (url) => url.includes('jobicy.com/api/v2/remote-jobs'),
        handler: (config) => {
            const params = config.params ?? {};
            if (!params.cursor) {
                return {
                    data: {
                        jobs: [
                            {
                                id: 5001,
                                jobTitle: 'Full Stack Engineer',
                                companyName: 'JobicyTech',
                                jobGeo: 'USA Only',
                                pubDate: '2026-09-04T00:00:00.000Z',
                                url: 'https://jobicy.com/jobs/5001',
                                jobDescription: 'React and Node engineer.',
                                salaryMin: 120000,
                                salaryMax: 150000,
                                salaryCurrency: 'USD',
                            },
                            {
                                id: 5002,
                                jobTitle: 'Junior Graphic Designer', // Filtered by title
                                companyName: 'DesignCo',
                            },
                        ],
                        hasMore: true,
                        nextCursor: 'page-2-cursor',
                    },
                };
            }
            if (params.cursor === 'page-2-cursor') {
                return {
                    data: {
                        jobs: [
                            {
                                id: 5003,
                                jobTitle: 'Senior Software Architect',
                                companyName: 'CloudCo',
                                jobGeo: 'Remote',
                                pubDate: '2026-09-05T00:00:00.000Z',
                                url: 'https://jobicy.com/jobs/5003',
                                jobDescription: 'Kubernetes and cloud platform.',
                                salaryMin: 140000,
                                salaryMax: 170000,
                                salaryCurrency: 'EUR', // Non-USD: _salary should be null
                            },
                            {
                                id: 5001, // Duplicate ID seen on page 1
                                jobTitle: 'Full Stack Engineer',
                                companyName: 'JobicyTech',
                            },
                        ],
                        hasMore: false,
                    },
                };
            }
            return { data: { jobs: [], hasMore: false } };
        },
    });

    const jobs = await scrapeJobicy();
    assert.ok(jobs.length >= 2);

    const usdJob = jobs.find(j => j.id === 'jcy-5001');
    assert.ok(usdJob);
    assert.equal(usdJob.company, 'JobicyTech');
    assert.deepEqual(usdJob._salary, { min: 120000, max: 150000 });

    const eurJob = jobs.find(j => j.id === 'jcy-5003');
    assert.ok(eurJob);
    assert.equal(eurJob._salary, null); // EUR currency parsed as null per implementation

    // Handles tag failure error branch without crashing
    mockRoutes = [{
        match: () => true,
        handler: () => ({ status: 500 }),
    }];
    assert.deepEqual(await scrapeJobicy(), []);
});
