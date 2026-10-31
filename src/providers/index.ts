import axios from 'axios';
import { sourceDate } from '../domain/dates.ts';
import type { JobPosting, WorkdayBoard } from '../domain/types.ts';
import { matchesTitle } from '../domain/filters.ts';
import { settings } from '../config/loader.ts';
import { companyBonusFor, scoreJob } from '../domain/scoring.ts';
import { parseLocation } from '../domain/location.ts';
import { extractAshbyCompensation } from '../presentation/output.ts';

const http = axios.create({ timeout: 15_000 });

export async function scrapeGreenhouse(company: string, companyBonus: number = 0): Promise<JobPosting[]> {
    try {
        const res = await http.get(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs?content=true`
        );
        return res.data.jobs
            .filter((job: any) => matchesTitle(job.title))
            .map((job: any) => {
                const loc = job.location?.name || '';
                const { isLocal, isRemoteEligible, locationScore } = parseLocation(loc, job.title);
                return {
                    id: `gh-${company}-${job.id}`,
                    postedAt: sourceDate(job.first_published),
                    sourceUpdatedAt: sourceDate(job.updated_at),
                    title: job.title,
                    company: company.toUpperCase(),
                    url: job.absolute_url,
                    location: loc,
                    description: job.content || '',
                    isRemote: isRemoteEligible,
                    isLocal,
                    locationScore,
                    score: scoreJob(job.content || '', job.title, locationScore, companyBonus),
                };
            });
    } catch {
        return [];
    }
}

export async function scrapeLever(company: string, companyBonus: number = 0): Promise<JobPosting[]> {
    try {
        const res = await http.get(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
        return res.data
            .filter((job: any) => matchesTitle(job.text))
            .map((job: any) => {
                const loc = job.categories?.location || '';
                const { isLocal, isRemoteEligible, locationScore } = parseLocation(loc, job.text);
                return {
                    id: `lever-${company}-${job.id}`,
                    remoteHint: job.workplaceType === 'remote',
                    title: job.text,
                    company,
                    url: job.hostedUrl,
                    location: loc,
                    description: job.descriptionPlain || '',
                    isRemote: isRemoteEligible,
                    isLocal,
                    locationScore,
                    score: scoreJob(job.descriptionPlain || '', job.text, locationScore, companyBonus),
                };
            });
    } catch {
        return [];
    }
}

export async function scrapeAshby(company: string, companyBonus: number = 0): Promise<JobPosting[]> {
    try {
        const res = await http.get(
            `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}?includeCompensation=true`
        );
        return (res.data.jobs || [])
            .filter((job: any) => matchesTitle(job.title))
            .map((job: any) => {
                const loc = job.location || '';
                const { isLocal, isRemoteEligible, locationScore } = parseLocation(job.isRemote ? `${loc} Remote` : loc, job.title);
                return {
                    id: `ashby-${company}-${job.id ?? job.jobUrl ?? job.applyUrl}`,
                    remoteHint: Boolean(job.isRemote),
                    country: job.address?.postalAddress?.addressCountry || '',
                    postedAt: sourceDate(job.publishedAt),
                    postedDateKind: 'lastPublished' as const,
                    title: job.title,
                    company: company.toUpperCase(),
                    url: job.applyUrl || `https://jobs.ashbyhq.com/${encodeURIComponent(company)}/${job.id}`,
                    location: loc,
                    description: job.descriptionHtml || '',
                    isRemote: isRemoteEligible,
                    isLocal,
                    locationScore,
                    score: scoreJob(job.descriptionHtml || '', job.title, locationScore, companyBonus),
                    _ashbyCompensation: extractAshbyCompensation(job),
                };
            });
    } catch {
        return [];
    }
}

export async function scrapeWorkday(board: WorkdayBoard): Promise<JobPosting[]> {
    const base = `https://${board.tenant}.${board.datacenter}.myworkdayjobs.com`;
    const endpoint = `${base}/wday/cxs/${encodeURIComponent(board.tenant)}/${encodeURIComponent(board.site)}/jobs`;
    const jobs: JobPosting[] = [];
    const companyBonus = companyBonusFor(board.displayName);

    try {
        let offset = 0;
        const limit = 20;

        while (true) {
            const res = await http.post(endpoint,
                { limit, offset, searchText: '', appliedFacets: {} },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const postings: any[] = res.data.jobPostings || [];
            if (postings.length === 0) break;

            for (const job of postings) {
                const title = job.title || '';
                if (!matchesTitle(title)) continue;

                const loc = job.locationsText || job.location || '';
                const { isLocal, isRemoteEligible, locationScore } = parseLocation(loc, title);

                jobs.push({
                    id: `wd-${board.tenant}-${job.externalPath}`,
                    title,
                    company: board.displayName,
                    url: `${base}${job.externalPath}`,
                    location: loc,
                    description: '', // full desc requires a second per-job request
                    isRemote: isRemoteEligible,
                    isLocal,
                    locationScore,
                    score: scoreJob('', title, locationScore, companyBonus),
                });
            }

            if (postings.length < limit) break;
            offset += limit;
        }
    } catch {
        // silently skip boards that block or have changed endpoints
    }

    return jobs;
}

// Scrape RemoteOK — indexes jobs from many ATS platforms, no company slug needed.
// Uses tag-based filtering to pre-filter for relevant roles.
export async function scrapeRemoteOK(): Promise<JobPosting[]> {
    const TAGS = settings.sources.remoteok.tags;
    const jobs: JobPosting[] = [];
    const seenIds = new Set<string>();

    for (const tag of TAGS) {
        try {
            const res = await http.get(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`, {
                headers: { 'User-Agent': 'jobs-radar/1.0 (personal job search tool)' },
            });
            // First element is metadata/legal notice, skip it
            const postings: any[] = (res.data || []).slice(1);

            for (const job of postings) {
                if (!job.slug || seenIds.has(job.id)) continue;
                seenIds.add(job.id);

                const title = job.position || '';
                if (!matchesTitle(title)) continue;

                const companyName = job.company || '';
                const companyBonus = companyBonusFor(companyName);
                const loc = job.location || '';
                const { isLocal, isRemoteEligible, locationScore } = parseLocation(loc, title);

                // RemoteOK is remote-only; apply configured country eligibility even for blank locations.
                const isRemote = parseLocation(loc || 'Remote', title).isRemoteEligible;

                const salary = (job.salary_min && job.salary_max)
                    ? { min: job.salary_min, max: job.salary_max }
                    : null;

                jobs.push({
                    id: `rok-${job.id}`,
                    remoteHint: true,
                    postedAt: sourceDate(job.date),
                    title,
                    company: companyName,
                    url: job.apply_url || job.url,
                    location: loc || 'Remote',
                    description: job.description || '',
                    isRemote,
                    isLocal,
                    locationScore,
                    score: scoreJob(job.description || '', title, locationScore, companyBonus),
                    _salary: salary,
                });
            }
        } catch {
            // tag failed, continue
        }
    }

    return jobs;
}

// Scrape Jobicy — indexes jobs from many ATS platforms, no company slug needed.
// Supports cursor-based pagination and tag/industry filtering.
export async function scrapeJobicy(): Promise<JobPosting[]> {
    const SEARCH_TAGS = settings.sources.jobicy.tags;
    const jobs: JobPosting[] = [];
    const seenIds = new Set<number>();

    for (const tag of SEARCH_TAGS) {
        try {
            let cursor: string | null = null;
            let page = 0;
            const MAX_PAGES = settings.sources.jobicy.maxPages;

            while (page < MAX_PAGES) {
                const params: Record<string, string> = { count: '20', tag };
                if (cursor) params.cursor = cursor;

                const res = await http.get('https://jobicy.com/api/v2/remote-jobs', { params });
                const data = res.data;
                const postings: any[] = data.jobs || [];
                if (postings.length === 0) break;

                for (const job of postings) {
                    if (seenIds.has(job.id)) continue;
                    seenIds.add(job.id);

                    const title = job.jobTitle || '';
                    if (!matchesTitle(title)) continue;

                    const companyName = job.companyName || '';
                    const companyBonus = companyBonusFor(companyName);
                    const loc = job.jobGeo || '';
                    const { isLocal, isRemoteEligible, locationScore } = parseLocation(loc, title);
                    const isRemote = isRemoteEligible;

                    const salary = (job.salaryMin && job.salaryCurrency === 'USD')
                        ? { min: job.salaryMin, max: job.salaryMax }
                        : null;

                    jobs.push({
                        id: `jcy-${job.id}`,
                        remoteHint: true,
                        postedAt: sourceDate(job.pubDate),
                        title,
                        company: companyName,
                        url: job.url,
                        location: loc || 'Remote',
                        description: job.jobDescription || '',
                        isRemote,
                        isLocal,
                        locationScore,
                        score: scoreJob(job.jobDescription || '', title, locationScore, companyBonus),
                        _salary: salary,
                    });
                }

                if (!data.hasMore) break;
                cursor = data.nextCursor ?? null;
                page++;
            }
        } catch {
            // tag failed, continue
        }
    }

    return jobs;
}
