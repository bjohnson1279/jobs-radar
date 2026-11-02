import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
    scrapeGreenhouse,
    scrapeLever,
    scrapeAshby,
    scrapeWorkday,
    scrapeRemoteOK,
    scrapeJobicy,
} from '../src/providers/index.ts';

// Save original Axios _request method
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

test('scrapeGreenhouse: parses valid jobs, filters non-matching titles, handles location and errors', async (t) => {
    t.after(restoreHttp);

    mockHttp(async (config) => {
        assert.ok(config.url.includes('boards-api.greenhouse.io/v1/boards/acme-corp/jobs?content=true'));
        return {
            status: 200,
            data: {
                jobs: [
                    {
                        id: 101,
                        title: 'Senior Software Engineer',
                        first_published: '2026-09-01T12:00:00Z',
                        updated_at: '2026-09-02T12:00:00Z',
                        absolute_url: 'https://boards.greenhouse.io/acme-corp/jobs/101',
                        location: { name: 'Seattle, WA' },
                        content: 'TypeScript Node.js engineer needed',
                    },
                    {
                        id: 102,
                        title: 'Product Marketing Manager', // Should be filtered out by matchesTitle
                        first_published: '2026-09-01T12:00:00Z',
                        absolute_url: 'https://boards.greenhouse.io/acme-corp/jobs/102',
                        location: { name: 'Seattle, WA' },
                        content: 'Marketing role',
                    },
                    {
                        id: 103,
                        title: 'Backend Engineer',
                        first_published: 'invalid-date',
                        updated_at: null,
                        absolute_url: 'https://boards.greenhouse.io/acme-corp/jobs/103',
                        location: null, // Test null location edge case
                        content: null, // Test null content edge case
                    },
                ],
            },
        };
    });

    const jobs = await scrapeGreenhouse('acme-corp', 25);
    assert.equal(jobs.length, 2);

    const first = jobs[0];
    assert.equal(first.id, 'gh-acme-corp-101');
    assert.equal(first.title, 'Senior Software Engineer');
    assert.equal(first.company, 'ACME-CORP');
    assert.equal(first.postedAt, '2026-09-01T12:00:00.000Z');
    assert.equal(first.sourceUpdatedAt, '2026-09-02T12:00:00.000Z');
    assert.equal(first.isLocal, true);
    assert.equal(first.locationScore, 30);
    assert.ok(first.score > 0);

    const second = jobs[1];
    assert.equal(second.id, 'gh-acme-corp-103');
    assert.equal(second.postedAt, null);
    assert.equal(second.sourceUpdatedAt, null);
    assert.equal(second.location, '');
    assert.equal(second.description, '');

    // Error handling: network failure or ATS outage returns empty array
    mockHttp(async () => {
        throw new Error('Network error 500 Internal Server Error');
    });
    const errorJobs = await scrapeGreenhouse('acme-corp');
    assert.deepEqual(errorJobs, []);
});

test('scrapeLever: parses postings, handles remote workplaceType, and catches errors', async (t) => {
    t.after(restoreHttp);

    mockHttp(async (config) => {
        assert.ok(config.url.includes('api.lever.co/v0/postings/test-lever?mode=json'));
        return {
            status: 200,
            data: [
                {
                    id: 'lever-abc',
                    text: 'Senior Full-Stack Developer',
                    workplaceType: 'remote',
                    hostedUrl: 'https://jobs.lever.co/test-lever/lever-abc',
                    categories: { location: 'Remote - US' },
                    descriptionPlain: 'TypeScript Node.js React developer',
                },
                {
                    id: 'lever-def',
                    text: 'Office Receptionist', // Non-matching role
                    categories: { location: 'Seattle' },
                },
                {
                    id: 'lever-xyz',
                    text: 'Staff Software Engineer',
                    workplaceType: 'onsite',
                    hostedUrl: 'https://jobs.lever.co/test-lever/lever-xyz',
                    categories: null, // missing categories edge case
                    descriptionPlain: null, // missing descriptionPlain edge case
                },
            ],
        };
    });

    const jobs = await scrapeLever('test-lever', 10);
    assert.equal(jobs.length, 2);

    const first = jobs[0];
    assert.equal(first.id, 'lever-test-lever-lever-abc');
    assert.equal(first.remoteHint, true);
    assert.equal(first.title, 'Senior Full-Stack Developer');
    assert.equal(first.company, 'test-lever');
    assert.equal(first.isRemote, true);
    assert.ok(first.score > 0);

    const second = jobs[1];
    assert.equal(second.id, 'lever-test-lever-lever-xyz');
    assert.equal(second.remoteHint, false);
    assert.equal(second.location, '');
    assert.equal(second.description, '');

    // Error handling
    mockHttp(async () => {
        throw new Error('404 Not Found');
    });
    const errorJobs = await scrapeLever('test-lever');
    assert.deepEqual(errorJobs, []);
});

test('scrapeAshby: parses compensation, remote location appending, address country, and errors', async (t) => {
    t.after(restoreHttp);

    mockHttp(async (config) => {
        assert.ok(config.url.includes('api.ashbyhq.com/posting-api/job-board/test-ashby?includeCompensation=true'));
        return {
            status: 200,
            data: {
                jobs: [
                    {
                        id: 'ashby-123',
                        title: 'Senior Backend Engineer',
                        isRemote: true,
                        publishedAt: '2026-09-01T08:00:00Z',
                        applyUrl: 'https://jobs.ashbyhq.com/test-ashby/apply/123',
                        location: 'Seattle, WA',
                        address: {
                            postalAddress: {
                                addressCountry: 'United States',
                            },
                        },
                        descriptionHtml: '<p>TypeScript AWS</p>',
                        compensation: {
                            compensationComponents: [
                                { compensationType: 'Salary', minValue: 150000, maxValue: 190000 },
                            ],
                        },
                    },
                    {
                        id: null,
                        jobUrl: 'https://jobs.ashbyhq.com/test-ashby/fallback-id',
                        title: 'Software Architect',
                        isRemote: false,
                        location: null,
                        descriptionHtml: null,
                    },
                ],
            },
        };
    });

    const jobs = await scrapeAshby('test-ashby', 15);
    assert.equal(jobs.length, 2);

    const first = jobs[0];
    assert.equal(first.id, 'ashby-test-ashby-ashby-123');
    assert.equal(first.remoteHint, true);
    assert.equal(first.country, 'United States');
    assert.equal(first.postedDateKind, 'lastPublished');
    assert.equal(first.company, 'TEST-ASHBY');
    assert.deepEqual(first._ashbyCompensation, { min: 150000, max: 190000 });

    const second = jobs[1];
    assert.equal(second.id, 'ashby-test-ashby-https://jobs.ashbyhq.com/test-ashby/fallback-id');
    assert.equal(second.remoteHint, false);
    assert.equal(second.location, '');
    assert.equal(second.description, '');
    assert.equal(second._ashbyCompensation, null);

    // Empty or malformed jobs response
    mockHttp(async () => ({ status: 200, data: {} }));
    const emptyJobs = await scrapeAshby('test-ashby');
    assert.deepEqual(emptyJobs, []);

    // Error handling
    mockHttp(async () => {
        throw new Error('Connection reset');
    });
    const errorJobs = await scrapeAshby('test-ashby');
    assert.deepEqual(errorJobs, []);
});

test('scrapeWorkday: paginates through postings, handles location fields and network errors', async (t) => {
    t.after(restoreHttp);

    const calls: any[] = [];
    mockHttp(async (config) => {
        calls.push(config);
        const { offset, limit } = config.data;

        if (offset === 0) {
            // First page returns 20 items (simulating limit threshold to trigger next page)
            const jobPostings = Array.from({ length: 20 }, (_, i) => ({
                title: i === 0 ? 'Senior Software Engineer' : 'Non-matching Job Title',
                locationsText: 'Seattle, WA',
                externalPath: `/job/posting-${i}`,
            }));
            return {
                status: 200,
                data: { jobPostings },
            };
        } else if (offset === 20) {
            // Second page returns 1 item, which is less than limit (20), terminating loop
            return {
                status: 200,
                data: {
                    jobPostings: [
                        {
                            title: 'Staff Software Engineer',
                            location: 'Redmond, WA', // Fallback to .location when locationsText is absent
                            externalPath: '/job/posting-last',
                        },
                    ],
                },
            };
        }
        return { status: 200, data: { jobPostings: [] } };
    });

    const board = {
        tenant: 'mycompany',
        datacenter: 'wd5',
        site: 'external_careers',
        displayName: 'My Company Inc',
    };

    const jobs = await scrapeWorkday(board);
    assert.equal(calls.length, 2);
    assert.equal(jobs.length, 2);

    assert.equal(jobs[0].id, 'wd-mycompany-/job/posting-0');
    assert.equal(jobs[0].company, 'My Company Inc');
    assert.equal(jobs[0].title, 'Senior Software Engineer');
    assert.equal(jobs[0].location, 'Seattle, WA');
    assert.equal(jobs[0].url, 'https://mycompany.wd5.myworkdayjobs.com/job/posting-0');

    assert.equal(jobs[1].id, 'wd-mycompany-/job/posting-last');
    assert.equal(jobs[1].title, 'Staff Software Engineer');
    assert.equal(jobs[1].location, 'Redmond, WA');

    // Error handling on request failure
    mockHttp(async () => {
        throw new Error('Workday endpoint blocked');
    });
    const errorJobs = await scrapeWorkday(board);
    assert.deepEqual(errorJobs, []);
});

test('scrapeRemoteOK: scrapes tags, handles metadata banner, deduplicates, and parses salary', async (t) => {
    t.after(restoreHttp);

    mockHttp(async (config) => {
        assert.ok(config.url.startsWith('https://remoteok.com/api?tag='));
        assert.equal(config.headers?.['User-Agent'], 'jobs-radar/1.0 (personal job search tool)');
        return {
            status: 200,
            data: [
                { legal: 'Legal notice banner item' }, // First item must be skipped
                {
                    id: '12345',
                    slug: '12345-senior-software-engineer',
                    position: 'Senior Software Engineer',
                    company: 'Acme Cloud',
                    location: 'Worldwide',
                    date: '2026-09-01T12:00:00Z',
                    apply_url: 'https://remoteok.com/apply/12345',
                    description: 'TypeScript Node.js role',
                    salary_min: 130000,
                    salary_max: 170000,
                },
                {
                    id: '67890',
                    slug: '67890-designer',
                    position: 'UI Designer', // Non-matching title
                    company: 'DesignCo',
                },
                {
                    id: '12345', // Duplicate ID across tags
                    slug: '12345-senior-software-engineer',
                    position: 'Senior Software Engineer',
                    company: 'Acme Cloud',
                },
                {
                    id: '99999',
                    // missing slug
                    position: 'Senior Backend Engineer',
                },
            ],
        };
    });

    const jobs = await scrapeRemoteOK();
    assert.equal(jobs.length, 1);
    const job = jobs[0];
    assert.equal(job.id, 'rok-12345');
    assert.equal(job.title, 'Senior Software Engineer');
    assert.equal(job.company, 'Acme Cloud');
    assert.equal(job.remoteHint, true);
    assert.equal(job.postedAt, '2026-09-01T12:00:00.000Z');
    assert.deepEqual(job._salary, { min: 130000, max: 170000 });

    // Handles API error gracefully
    mockHttp(async () => {
        throw new Error('RemoteOK rate limited');
    });
    const errorJobs = await scrapeRemoteOK();
    assert.deepEqual(errorJobs, []);
});

test('scrapeJobicy: parses cursor pagination, currency filters, and gracefully handles network errors', async (t) => {
    t.after(restoreHttp);

    let pageCount = 0;
    mockHttp(async (config) => {
        assert.ok(config.url.includes('https://jobicy.com/api/v2/remote-jobs'));
        pageCount++;

        if (!config.params?.cursor) {
            return {
                status: 200,
                data: {
                    hasMore: true,
                    nextCursor: 'cursor-page-2',
                    jobs: [
                        {
                            id: 111,
                            jobTitle: 'Senior Software Engineer',
                            companyName: 'Jobicy Co',
                            jobGeo: 'USA Only',
                            pubDate: '2026-09-01T10:00:00Z',
                            url: 'https://jobicy.com/jobs/111',
                            jobDescription: 'TypeScript and Node.js backend',
                            salaryMin: 140000,
                            salaryMax: 180000,
                            salaryCurrency: 'USD',
                        },
                        {
                            id: 222,
                            jobTitle: 'Senior Software Engineer',
                            companyName: 'Euro Co',
                            salaryMin: 80000,
                            salaryMax: 90000,
                            salaryCurrency: 'EUR', // Non-USD should not populate _salary
                        },
                    ],
                },
            };
        } else if (config.params.cursor === 'cursor-page-2') {
            return {
                status: 200,
                data: {
                    hasMore: false,
                    jobs: [
                        {
                            id: 333,
                            jobTitle: 'Backend Engineer',
                            companyName: 'Final Co',
                            jobGeo: 'Worldwide',
                            pubDate: null,
                            url: 'https://jobicy.com/jobs/333',
                            jobDescription: 'TypeScript',
                        },
                    ],
                },
            };
        }
        return { status: 200, data: { jobs: [] } };
    });

    const jobs = await scrapeJobicy();
    assert.ok(jobs.length >= 3);
    const usdJob = jobs.find(j => j.id === 'jcy-111');
    assert.ok(usdJob);
    assert.deepEqual(usdJob?._salary, { min: 140000, max: 180000 });

    const nonUsdJob = jobs.find(j => j.id === 'jcy-222');
    assert.ok(nonUsdJob);
    assert.equal(nonUsdJob?._salary, null);

    // Error handling
    mockHttp(async () => {
        throw new Error('503 Service Unavailable');
    });
    const errorJobs = await scrapeJobicy();
    assert.deepEqual(errorJobs, []);
});
