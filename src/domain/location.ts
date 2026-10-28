import { compilePattern, settings, type SearchConfig } from '../config/loader.ts';
import { createCountryMatcher } from './countries.ts';

export function createLocationMatcher(config: SearchConfig) {
    const preferences = config.location;
    const local = compilePattern(preferences.localPattern);
    const excludedLocal = compilePattern(preferences.excludedLocalPattern);
    const remote = compilePattern(preferences.remotePattern);
    const country = createCountryMatcher(preferences.country);
    const restrictedRemote = compilePattern(preferences.restrictedRemotePattern);
    const tiers = preferences.tiers.map(tier => ({ ...tier, regex: compilePattern(tier.pattern) }));
    const locationScoreFor = (location: string) => {
        if (excludedLocal.test(location) && !local.test(location)) return 0;
        // Avoid allocating intermediate arrays with a single loop finding max points
        let maxPoints = 0;
        for (const tier of tiers) {
            if (tier.points > maxPoints && tier.regex.test(location)) {
                maxPoints = tier.points;
            }
        }
        return maxPoints;
    };
    const parseLocation = (location: string, title = '', sourceCountry = '') => {
        const combined = `${location} ${title}`;
        let locationScore = 0;
        let hasTierMatch = false;
        if (!excludedLocal.test(location) || local.test(location)) {
            for (const tier of tiers) {
                if (tier.regex.test(location)) {
                    hasTierMatch = true;
                    if (tier.points > locationScore) locationScore = tier.points;
                }
            }
        }
        // Country evidence comes from location/structured metadata, never the title.
        const geography = `${location} ${sourceCountry}`;
        const foreign = country.foreign(geography) || restrictedRemote.test(country.withoutTarget(geography));
        const isLocal = !foreign && (local.test(location) || (hasTierMatch && !excludedLocal.test(location)));
        const explicitlyEligible = country.matches(geography);
        const eligible = explicitlyEligible || (!foreign && (isLocal || preferences.allowUnspecifiedRemote));
        return {
            isLocal,
            isRemoteEligible: remote.test(combined) && eligible && (!foreign || (explicitlyEligible && preferences.allowMultiCountryRemote)),
            locationScore: isLocal ? locationScore : 0,
        };
    };
    return { locationScoreFor, parseLocation };
}

export const { locationScoreFor, parseLocation } = createLocationMatcher(settings);
