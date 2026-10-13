import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, settings, validateConfig } from '../src/config/loader.ts';
import { createLocationMatcher } from '../src/domain/location.ts';
import { createScorer } from '../src/domain/scoring.ts';
import { createTitleFilters } from '../src/domain/filters.ts';
import { createRanker } from '../src/domain/ranking.ts';
import type { JobPosting } from '../src/domain/types.ts';
import { fileURLToPath } from 'node:url';

const example = loadConfig(fileURLToPath(new URL('../config/examples/toronto-product-design.json', import.meta.url)));

test('another location, country, and profession require no source changes', () => {
    const matchesTitle = createTitleFilters(example);
    const { parseLocation, locationScoreFor } = createLocationMatcher(example);
    const scorer = createScorer(example);
    assert.equal(matchesTitle('Product Designer'), true);
    assert.equal(matchesTitle('Design Manager'), true);
    assert.equal(matchesTitle('Senior Software Engineer'), false);
    assert.equal(locationScoreFor('Toronto, ON'), 30);
    assert.equal(locationScoreFor('Markham, ON'), 20);
    assert.equal(locationScoreFor('Seattle, WA'), 0);
    assert.equal(parseLocation('Toronto, ON').isLocal, true);
    assert.equal(parseLocation('Remote - Canada').isRemoteEligible, true);
    assert.equal(parseLocation('Remote - US').isRemoteEligible, false);
    assert.equal(parseLocation('Remote').isRemoteEligible, false);
    assert.equal(parseLocation('Worldwide').isRemoteEligible, false);
    assert.equal(scorer.companyBonusFor('Example Design Co'), 20);
    assert.equal(scorer.companyBonusFor('Example Engineering'), 0);
    assert.equal(scorer.isBlocklisted('Example Blocked Company'), false);
    assert.equal(scorer.scoreJob('Figma user research', 'Product Designer'), 60);
    assert.equal(scorer.scoreJob('Figma user research .NET Rails', 'Product Designer'), 60);
    assert.equal(scorer.scoreJob('Figma user research fast-paced', 'Product Designer'), 48);
});

test('saved listings are reclassified and rescored without losing application history', () => {
    const job: JobPosting & { appliedAt: string; firstSeenAt: string } = {
        id: 'saved', title: 'Product Designer', company: 'Example Design Company',
        location: 'Toronto, ON', url: 'https://example.com/1', description: 'Figma user research',
        isLocal: false, isRemote: false, locationScore: 0, score: 0,
        appliedAt: '2026-10-01T00:00:00Z', firstSeenAt: '2026-09-30T00:00:00Z',
    };
    assert.equal(createRanker(settings)([job]).length, 0);
    const ranked = createRanker(example)([job]);
    assert.equal(ranked[0].score, 100);
    assert.equal(ranked[0].isLocal, true);
    assert.equal(ranked[0].appliedAt, job.appliedAt);
    assert.equal(ranked[0].firstSeenAt, job.firstSeenAt);
    assert.ok(ranked[0].pros.some(signal => signal.label === 'Toronto proximity'));
    const remoteOnly = structuredClone(example);
    remoteOnly.location.includeLocal = false;
    assert.equal(createRanker(remoteOnly)([job]).length, 0);
    const remote = createRanker(remoteOnly)([{ ...job, location: 'Montreal, Canada', remoteHint: true }]);
    assert.equal(remote.length, 1);
    assert.equal(remote[0].isRemote, true);
    assert.equal(remote[0].isLocal, false);
    assert.equal(remote[0].appliedAt, job.appliedAt);
});

test('validation reports invalid patterns, weights, missing settings, and typos', () => {
    const invalidPattern = structuredClone(settings);
    invalidPattern.location.localPattern = '[';
    assert.throws(() => validateConfig(invalidPattern), /location.localPattern: invalid regular expression/);
    const invalidWeight = structuredClone(settings);
    invalidWeight.scoring.rules[0].points = NaN;
    assert.throws(() => validateConfig(invalidWeight), /scoring.rules\[0\].points/);
    assert.throws(() => validateConfig({ ...settings, typo: true }), /unknown setting typo/);
    assert.throws(() => validateConfig({ ...settings, sources: undefined }), /sources: expected an object/);
    assert.throws(() => loadConfig('does-not-exist.json'), /Unable to load configuration/);
});

test('empty patterns disable exclusions and rules while allowing any title', () => {
    const config = structuredClone(example);
    config.roles.includeTitlePattern = '';
    config.roles.excludeTitlePattern = '';
    config.roles.excludedScoringTitlePattern = '';
    config.scoring.rules = [{ label: 'Disabled', pattern: '', points: 100, scope: 'content' }];
    assert.equal(createTitleFilters(config)('Any Job'), true);
    assert.equal(createScorer(config).scoreJob('Anything', 'Any Job'), 0);
    config.location.includeRemote = false;
    const local = createLocationMatcher(config).parseLocation('Toronto, ON');
    assert.equal(local.isLocal, true);
    config.location.localPattern = '';
    config.location.tiers = [{ label: 'Eligible without bonus', pattern: 'Toronto', points: 0 }];
    const zeroBonus = createLocationMatcher(config).parseLocation('Toronto, ON');
    assert.equal(zeroBonus.isLocal, true);
    assert.equal(zeroBonus.locationScore, 0);
});
