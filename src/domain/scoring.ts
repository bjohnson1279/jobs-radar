import { compilePattern, settings, type SearchConfig } from '../config/loader.ts';

const normalizeCompany = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function plainText(text: string): string {
    let s = text;
    // Skip expensive HTML entity and tag regex replacements if no tags or entities exist
    if (s.includes('<') || s.includes('&')) {
        s = s.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ')
            .replace(/&amp;/gi, '&').replace(/&#(?:35|x23);/gi, '#')
            .replace(/&(?:ndash|mdash);|&#(?:8211|8212);/gi, '-');
    }
    if (/\s{2,}|[\r\n\t\v\f]/.test(s)) {
        s = s.replace(/\s+/g, ' ');
    }
    return s;
}

export function createScorer(config: SearchConfig) {
    const targets = new Set(config.companies.targets.map(normalizeCompany));
    const blocklist = new Set(config.companies.blocklist.map(normalizeCompany));
    const aliases = new Map(Object.entries(config.companies.aliases).map(([alias, target]) => [normalizeCompany(alias), normalizeCompany(target)]));
    const rules = config.scoring.rules.map(rule => ({ ...rule, regex: compilePattern(rule.pattern) }));
    const excludedTitle = compilePattern(config.roles.excludedScoringTitlePattern);
    // Cache company normalization and target/blocklist lookups since company names repeat heavily.
    const companyCache = new Map<string, { bonus: number; blocklisted: boolean }>();
    const getCompanyInfo = (name: string) => {
        let cached = companyCache.get(name);
        if (cached) return cached;
        const key = normalizeCompany(name);
        const bonus = targets.has(key) || targets.has(aliases.get(key) ?? '') ? config.companies.bonus : 0;
        const blocklisted = blocklist.has(key);
        cached = { bonus, blocklisted };
        companyCache.set(name, cached);
        return cached;
    };
    const companyBonusFor = (name: string) => getCompanyInfo(name).bonus;
    const isBlocklisted = (name: string) => getCompanyInfo(name).blocklisted;

    // Single unified scoring engine supporting both fast-path score calculation and detailed breakdown generation.
    const evaluateScoring = (text: string, title: string, locationScore = 0, companyBonus = 0, includeDetails = false) => {
        if (excludedTitle.test(title)) {
            if (!includeDetails) return { score: 0 };
            return { score: 0, rawScore: 0, reasons: ['Title outside preferred role'], pros: [], cons: [{ label: 'Title outside preferred role', points: 0, contribution: 0 }] };
        }
        let score = 0;
        const reasons: string[] = includeDetails ? [] : [];
        const pros: Array<{ label: string; points: number; contribution: number }> = includeDetails ? [] : [];
        const cons: Array<{ label: string; points: number; contribution: number }> = includeDetails ? [] : [];

        const add = (label: string, points: number) => {
            if (!points) return;
            score += points;
            if (includeDetails) {
                const contribution = Number((points * 100 / config.scoring.maxRawScore).toFixed(2));
                (points > 0 ? pros : cons).push({ label, points, contribution });
                reasons.push(`${label} ${points > 0 ? '+' : ''}${contribution}`);
            }
        };

        add(config.location.proximityLabel, locationScore);
        add('Target company', companyBonus);
        const content = plainText(`${title} ${text}`);
        // Avoid allocating new Set() per job score call; use lazy string array for group matching.
        let matchedGroups: string[] | null = null;
        for (const rule of rules) {
            if (rule.group && matchedGroups && matchedGroups.includes(rule.group)) continue;
            if (rule.regex.test(rule.scope === 'title' ? title : content)) {
                add(rule.label, rule.points);
                if (rule.group) {
                    if (!matchedGroups) matchedGroups = [rule.group];
                    else matchedGroups.push(rule.group);
                }
            }
        }
        const rawScore = Math.max(0, score);
        const finalScore = Math.min(100, Math.round(rawScore * 100 / config.scoring.maxRawScore));
        if (!includeDetails) return { score: finalScore };
        return { score: finalScore, rawScore, reasons, pros, cons };
    };

    const scoreJobDetails = (text: string, title: string, locationScore = 0, companyBonus = 0) =>
        evaluateScoring(text, title, locationScore, companyBonus, true) as {
            score: number;
            rawScore: number;
            reasons: string[];
            pros: Array<{ label: string; points: number; contribution: number }>;
            cons: Array<{ label: string; points: number; contribution: number }>;
        };

    const scoreJob = (text: string, title: string, locationScore = 0, companyBonus = 0) =>
        evaluateScoring(text, title, locationScore, companyBonus, false).score;

    return { companyBonusFor, isBlocklisted, scoreJobDetails, scoreJob };
}

export const { companyBonusFor, isBlocklisted, scoreJobDetails, scoreJob } = createScorer(settings);
