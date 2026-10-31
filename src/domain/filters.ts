import { compilePattern, settings, type SearchConfig } from '../config/loader.ts';

export function createTitleFilters(config: SearchConfig) {
    const include = compilePattern(config.roles.includeTitlePattern);
    const exclude = compilePattern(config.roles.excludeTitlePattern);
    const excludedStack = compilePattern(config.roles.excludeTitleStackPattern ?? '');
    // Scope-bound Map memoization to avoid executing multi-regex title matchers repeatedly on identical job titles.
    const cache = new Map<string, boolean>();
    return (title: string) => {
        let cached = cache.get(title);
        if (cached !== undefined) return cached;
        const result = (!config.roles.includeTitlePattern || include.test(title)) && !exclude.test(title) && !excludedStack.test(title);
        cache.set(title, result);
        return result;
    };
}

export const matchesTitle = createTitleFilters(settings);
