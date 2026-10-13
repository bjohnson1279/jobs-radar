import { compilePattern, settings, type SearchConfig } from '../config/loader.ts';

export function createTitleFilters(config: SearchConfig) {
    const include = compilePattern(config.roles.includeTitlePattern);
    const exclude = compilePattern(config.roles.excludeTitlePattern);
    return (title: string) => (!config.roles.includeTitlePattern || include.test(title)) && !exclude.test(title);
}

export const matchesTitle = createTitleFilters(settings);
