import type { JobPosting } from './types.ts';
import { settings, type SearchConfig } from '../config/loader.ts';
import { createScorer, plainText } from './scoring.ts';
import { createLocationMatcher } from './location.ts';
import { createTitleFilters } from './filters.ts';

export function createRanker(config: SearchConfig) {
    const { companyBonusFor, isBlocklisted, scoreJobDetails } = createScorer(config);
    const { parseLocation } = createLocationMatcher(config);
    const matchesTitle = createTitleFilters(config);
    const includeLocal = config.location.includeLocal;
    const includeRemote = config.location.includeRemote;

    // Filter location eligibility before HTML cleaning/scoring, eliminating intermediate array allocations.
    return <T extends JobPosting>(jobs: T[]) => {
        const ranked: Array<T & ReturnType<typeof scoreJobDetails>> = [];
        for (const job of jobs) {
            if (isBlocklisted(job.company) || !matchesTitle(job.title)) continue;

            // Reclassify saved listings so new preferences apply without deleting history.
            const location = parseLocation(`${job.location}${job.remoteHint || job.isRemote ? ' Remote' : ''}`, job.title, job.country);
            const isLocal = location.isLocal;
            const isRemote = location.isRemoteEligible;
            if (!((includeLocal && isLocal) || (includeRemote && isRemote))) continue;

            const cleanDescription = plainText(job.description);
            ranked.push({
                ...job,
                isLocal,
                isRemote,
                locationScore: location.locationScore,
                description: cleanDescription,
                ...scoreJobDetails(cleanDescription, job.title, location.locationScore, companyBonusFor(job.company)),
            });
        }
        return ranked.sort((a, b) => b.rawScore - a.rawScore || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
    };
}

export const rankJobs = createRanker(settings);
