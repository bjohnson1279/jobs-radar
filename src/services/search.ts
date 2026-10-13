import type { JobPosting } from '../domain/types.ts';
import { settings } from '../config/loader.ts';
import { scrapeGreenhouse, scrapeLever, scrapeAshby, scrapeWorkday, scrapeRemoteOK, scrapeJobicy } from '../providers/index.ts';
import { deduplicateJobs, formatJob } from '../presentation/output.ts';
import { companyBonusFor, isBlocklisted } from '../domain/scoring.ts';
import { rankJobs } from '../domain/ranking.ts';

export async function collectJobs() {
    const allJobs: JobPosting[] = [];
    const sources = settings.sources;
    for (const [label, boards, scrape] of [
        ['Greenhouse', sources.greenhouse, scrapeGreenhouse],
        ['Lever', sources.lever, scrapeLever],
        ['Ashby', sources.ashby, scrapeAshby],
    ] as const) {
        if (!boards.length) continue;
        process.stdout.write(`Scraping ${label} (${boards.length} boards)...`);
        for (const company of boards) allJobs.push(...await scrape(company, companyBonusFor(company)));
        console.log(' done');
    }
    if (sources.workday.length) {
        process.stdout.write(`Scraping Workday (${sources.workday.length} boards)...`);
        for (const board of sources.workday) allJobs.push(...await scrapeWorkday(board));
        console.log(' done');
    }
    for (const [label, enabled, scrape] of [
        ['RemoteOK', sources.remoteok.enabled, scrapeRemoteOK],
        ['Jobicy', sources.jobicy.enabled, scrapeJobicy],
    ] as const) {
        if (!enabled) continue;
        process.stdout.write(`Scraping ${label} (broad discovery)...`);
        allJobs.push(...await scrape());
        console.log(' done');
    }
    return deduplicateJobs(allJobs.filter(job => !isBlocklisted(job.company)));
}

export async function run() {
    const ranked = rankJobs(await collectJobs());
    const localRanked = settings.location.includeLocal ? ranked.filter(job => job.isLocal) : [];
    const remoteRanked = ranked.filter(job => job.isRemote && (!settings.location.includeLocal || !job.isLocal));
    console.log(`\n=== LOCAL MATCHES: ${settings.location.label} (${localRanked.length}) ===`);
    console.log(settings.location.tiers.map(tier => `${tier.label}: +${tier.points}`).join(' | '));
    localRanked.slice(0, settings.output.limit).forEach(job => console.log(formatJob(job)));
    console.log(`\n=== REMOTE MATCHES (${remoteRanked.length}) ===`);
    remoteRanked.slice(0, settings.output.limit).forEach(job => console.log(formatJob(job)));
}
