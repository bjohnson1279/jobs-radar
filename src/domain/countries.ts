const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const regions = new Map<string, string>();
for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const name = displayNames.of(code);
        if (name && name !== code) regions.set(code, name);
    }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const literalPattern = (names: string[]) => new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(?:${names.sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu',
);

export function createCountryMatcher(country: { name: string; aliases: string[] }) {
    const names = [country.name, ...country.aliases];
    const targetNames = new Set(names.map(name => name.toLowerCase()));
    const targetCodes = new Set([...regions].filter(([code, name]) => targetNames.has(code.toLowerCase()) || targetNames.has(name.toLowerCase())).map(([code]) => code));
    const accepted = literalPattern(names);
    // Country names supplement the profile's city/region exclusions. Short codes
    // remain explicit aliases, since many conflict with state abbreviations.
    const foreignNames = [...regions].filter(([code]) => !targetCodes.has(code)).map(([, name]) => name);
    const foreign = literalPattern(foreignNames);
    const foreignCodes = [...regions.keys()].filter(code => !targetCodes.has(code));
    const separatedForeignCode = new RegExp(`(?:[/;|&]|\\b(?:and|or)\\b)\\s*(?:${foreignCodes.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');
    return {
        matches: (text: string) => accepted.test(text),
        foreign: (text: string) => foreign.test(text) || separatedForeignCode.test(text),
        withoutTarget: (text: string) => text.replace(new RegExp(accepted.source, 'giu'), ' '),
    };
}
