import { compilePattern, settings, type SearchConfig } from '../config/loader.ts';

const normalizeCompany = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function plainText(text: string): string {
    return text.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ')
        .replace(/&amp;/gi, '&').replace(/&#(?:35|x23);/gi, '#')
        .replace(/&(?:ndash|mdash);|&#(?:8211|8212);/gi, '-').replace(/\s+/g, ' ');
}

export function createScorer(config: SearchConfig) {
    const targets = new Set(config.companies.targets.map(normalizeCompany));
    const blocklist = new Set(config.companies.blocklist.map(normalizeCompany));
    const aliases = new Map(Object.entries(config.companies.aliases).map(([alias, target]) => [normalizeCompany(alias), normalizeCompany(target)]));
    const rules = config.scoring.rules.map(rule => ({ ...rule, regex: compilePattern(rule.pattern) }));
    const excludedTitle = compilePattern(config.roles.excludedScoringTitlePattern);
    const companyBonusFor = (name: string) => {
        const key = normalizeCompany(name);
        return targets.has(key) || targets.has(aliases.get(key) ?? '') ? config.companies.bonus : 0;
    };
    const isBlocklisted = (name: string) => blocklist.has(normalizeCompany(name));
    const scoreJobDetails = (text: string, title: string, locationScore = 0, companyBonus = 0) => {
        const reasons: string[] = [];
        const pros: Array<{ label: string; points: number; contribution: number }> = [];
        const cons: Array<{ label: string; points: number; contribution: number }> = [];
        if (excludedTitle.test(title)) {
            return { score: 0, rawScore: 0, reasons: ['Title outside preferred role'], pros, cons: [{ label: 'Title outside preferred role', points: 0, contribution: 0 }] };
        }
        let score = 0;
        const add = (label: string, points: number) => {
            if (!points) return;
            score += points;
            const contribution = Number((points * 100 / config.scoring.maxRawScore).toFixed(2));
            (points > 0 ? pros : cons).push({ label, points, contribution });
            reasons.push(`${label} ${points > 0 ? '+' : ''}${contribution}`);
        };
        add(config.location.proximityLabel, locationScore);
        add('Target company', companyBonus);
        const content = plainText(`${title} ${text}`);
        const matchedGroups = new Set<string>();
        for (const rule of rules) {
            if (rule.group && matchedGroups.has(rule.group)) continue;
            if (rule.regex.test(rule.scope === 'title' ? title : content)) {
                add(rule.label, rule.points);
                if (rule.group) matchedGroups.add(rule.group);
            }
        }
        const rawScore = Math.max(0, score);
        return { score: Math.min(100, Math.round(rawScore * 100 / config.scoring.maxRawScore)), rawScore, reasons, pros, cons };
    };
    const scoreJob = (text: string, title: string, locationScore = 0, companyBonus = 0) => scoreJobDetails(text, title, locationScore, companyBonus).score;
    return { companyBonusFor, isBlocklisted, scoreJobDetails, scoreJob };
}

export const { companyBonusFor, isBlocklisted, scoreJobDetails, scoreJob } = createScorer(settings);
