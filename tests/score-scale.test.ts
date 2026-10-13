import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings, validateConfig } from '../src/config/loader.ts';
import { createScorer } from '../src/domain/scoring.ts';
import { createRanker } from '../src/domain/ranking.ts';
import type { JobPosting } from '../src/domain/types.ts';

test('fixed scale converts weighted totals to 0–100 with scaled explanations', () => {
    const config = structuredClone(settings);
    config.scoring.rules = [
        { label: 'Strength', pattern: 'strength', points: 145, scope: 'content' },
        { label: 'Penalty', pattern: 'penalty', points: -20, scope: 'content' },
        { label: 'Extra', pattern: 'extra', points: 100, scope: 'content' },
    ];
    const scorer = createScorer(config);
    const fit = scorer.scoreJobDetails('strength', 'Software Engineer');
    assert.equal(fit.rawScore, 145);
    assert.equal(fit.score, 73);
    assert.equal(fit.pros[0].contribution, 72.5);
    assert.equal(scorer.scoreJob('strength penalty', 'Software Engineer'), 63);
    assert.equal(scorer.scoreJob('penalty', 'Software Engineer'), 0);
    assert.equal(scorer.scoreJob('', 'Software Engineer'), 0);
    assert.equal(scorer.scoreJob('strength extra', 'Software Engineer'), 100);
    config.scoring.maxRawScore = 100;
    assert.equal(createScorer(config).scoreJob('strength', 'Software Engineer'), 100);
    config.scoring.maxRawScore = 0;
    assert.throws(() => validateConfig(config), /maxRawScore/);
});

test('rounded and capped score ties preserve weighted ranking', () => {
    const config = structuredClone(settings);
    config.scoring.rules = [
        { label: '145', pattern: 'match145', points: 145, scope: 'content' },
        { label: '146', pattern: 'match146', points: 146, scope: 'content' },
        { label: '220', pattern: 'match220', points: 220, scope: 'content' },
        { label: '250', pattern: 'match250', points: 250, scope: 'content' },
    ];
    const base: JobPosting = {
        id: '1', company: 'Example', title: 'Software Engineer', location: 'Remote - US',
        description: '', url: 'https://example.com/job', isRemote: true, isLocal: false, locationScore: 0, score: 0,
    };
    const jobs = [145, 146, 220, 250].map(value => ({ ...base, id: String(value), description: `match${value}` }));
    const ranked = createRanker(config)(jobs);
    assert.deepEqual(ranked.map(job => job.id), ['250', '220', '146', '145']);
    assert.deepEqual(ranked.map(job => job.score), [100, 100, 73, 73]);
});
