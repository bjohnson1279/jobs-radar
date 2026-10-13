import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkdayBoard } from '../domain/types.ts';

export interface PatternRule { label: string; pattern: string; points: number }
export interface SearchConfig {
    profile: { name: string; description: string };
    location: {
        country: { name: string; aliases: string[] };
        allowMultiCountryRemote: boolean;
        label: string; proximityLabel: string; includeLocal: boolean; includeRemote: boolean;
        localPattern: string; excludedLocalPattern: string; remotePattern: string;
        restrictedRemotePattern: string; allowUnspecifiedRemote: boolean;
        tiers: PatternRule[];
    };
    roles: { includeTitlePattern: string; excludeTitlePattern: string; excludedScoringTitlePattern: string };
    companies: { targets: string[]; bonus: number; aliases: Record<string, string>; blocklist: string[] };
    scoring: { maxRawScore: number; rules: Array<PatternRule & { scope: 'title' | 'content'; group?: string }> };
    sources: {
        greenhouse: string[]; lever: string[]; ashby: string[]; workday: WorkdayBoard[];
        remoteok: { enabled: boolean; tags: string[] };
        jobicy: { enabled: boolean; tags: string[]; maxPages: number };
    };
    output: { limit: number };
}

export function compilePattern(pattern: string): RegExp {
    return new RegExp(pattern || '(?!)', 'i');
}

// The shape validates every required setting, rejects typos, and names invalid fields.
type Shape = string | { [key: string]: Shape } | [Shape];
const ruleShape = { label: 'string', pattern: 'pattern', points: 'weight' };
const shape: Shape = {
    profile: { name: 'string', description: 'string' },
    location: {
        country: { name: 'nonempty', aliases: ['nonempty'] },
        allowMultiCountryRemote: 'boolean',
        label: 'string', proximityLabel: 'string', includeLocal: 'boolean', includeRemote: 'boolean',
        localPattern: 'pattern', excludedLocalPattern: 'pattern', remotePattern: 'pattern',
        restrictedRemotePattern: 'pattern', allowUnspecifiedRemote: 'boolean',
        tiers: [{ ...ruleShape, points: 'bonus' }],
    },
    roles: { includeTitlePattern: 'pattern', excludeTitlePattern: 'pattern', excludedScoringTitlePattern: 'pattern' },
    companies: { targets: ['nonempty'], bonus: 'bonus', aliases: 'aliases', blocklist: ['nonempty'] },
    scoring: { maxRawScore: 'limit', rules: [{ ...ruleShape, scope: 'scope', group: 'optionalString' }] },
    sources: {
        greenhouse: ['nonempty'], lever: ['nonempty'], ashby: ['nonempty'],
        workday: [{ tenant: 'nonempty', datacenter: 'nonempty', site: 'nonempty', displayName: 'nonempty' }],
        remoteok: { enabled: 'boolean', tags: ['nonempty'] },
        jobicy: { enabled: 'boolean', tags: ['nonempty'], maxPages: 'pages' },
    },
    output: { limit: 'limit' },
};

export function validateConfig(value: unknown): SearchConfig {
    function check(value: unknown, schema: Shape, path: string): void {
        const fail = (message: string): never => { throw new Error(`${path}: ${message}`); };
        if (Array.isArray(schema)) {
            if (!Array.isArray(value)) return fail('expected an array');
            value.forEach((item, index) => check(item, schema[0], `${path}[${index}]`));
        } else if (typeof schema === 'object') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object');
            const object = value as Record<string, unknown>;
            for (const key of Object.keys(object)) if (!Object.hasOwn(schema, key)) fail(`unknown setting ${key}`);
            for (const [key, child] of Object.entries(schema)) check(object[key], child, `${path}.${key}`);
        } else if (schema === 'aliases') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object of alias names and targets');
            for (const [key, target] of Object.entries(value)) {
                if (!key.trim()) fail('alias names must not be empty');
                check(target, 'nonempty', `${path}.${key}`);
            }
        } else if (schema === 'boolean') {
            if (typeof value !== 'boolean') fail('expected true or false');
        } else if (['weight', 'bonus', 'pages', 'limit'].includes(schema)) {
            const min = schema === 'weight' ? -1000 : schema === 'bonus' ? 0 : 1;
            const max = schema === 'pages' ? 100 : schema === 'limit' ? 10000 : 1000;
            if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(`expected an integer from ${min} to ${max}`);
        } else {
            if (schema === 'optionalString' && value === undefined) return;
            if (typeof value !== 'string') return fail('expected a string');
            if (schema === 'nonempty' && !value.trim()) fail('must not be empty');
            if (schema === 'scope' && value !== 'title' && value !== 'content') fail('expected title or content');
            if (schema === 'pattern') try { compilePattern(value); } catch { fail('invalid regular expression'); }
        }
    }
    check(value, shape, 'config');
    return structuredClone(value) as SearchConfig;
}

export function loadConfig(path: string): SearchConfig {
    try { return validateConfig(JSON.parse(readFileSync(path, 'utf8'))); }
    catch (error) { throw new Error(`Unable to load configuration ${path}: ${(error as Error).message}`); }
}

const localPath = fileURLToPath(new URL('../../config/settings.local.json', import.meta.url));
export const configPath = process.env.JOBS_RADAR_CONFIG ? resolve(process.env.JOBS_RADAR_CONFIG)
    : existsSync(localPath) ? localPath
    : fileURLToPath(new URL('../../config/settings.example.json', import.meta.url));
export const settings = loadConfig(configPath);
