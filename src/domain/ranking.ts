import type { JobPosting } from './types.ts';
import { settings, type SearchConfig } from '../config/loader.ts';
import { createScorer, plainText } from './scoring.ts';
import { createLocationMatcher } from './location.ts';
import { createTitleFilters } from './filters.ts';

export function createRanker(config: SearchConfig) {
    const { companyBonusFor, isBlocklisted, scoreJobDetails } = createScorer(config);
    const { parseLocation } = createLocationMatcher(config);
    const matchesTitle = createTitleFilters(config);
    return <T extends JobPosting>(jobs: T[]) => jobs
        .filter(job => !isBlocklisted(job.company) && matchesTitle(job.title))
        .map(job => {
            // Reclassify saved listings so new preferences apply without deleting history.
            const location = parseLocation(`${job.location}${job.remoteHint || job.isRemote ? ' Remote' : ''}`, job.title, job.country);
            const cleanDescription = plainText(job.description);
            return {
                ...job,
                isLocal: location.isLocal,
                isRemote: location.isRemoteEligible,
                locationScore: location.locationScore,
                description: cleanDescription,
                ...scoreJobDetails(cleanDescription, job.title, location.locationScore, companyBonusFor(job.company)),
            };
        })
        .filter(job => (config.location.includeLocal && job.isLocal) || (config.location.includeRemote && job.isRemote))
        .sort((a, b) => b.rawScore - a.rawScore || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
}

export const rankJobs = createRanker(settings);
