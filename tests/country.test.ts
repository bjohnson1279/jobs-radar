import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings, validateConfig } from '../src/config/loader.ts';
import { createLocationMatcher } from '../src/domain/location.ts';
import { createRanker } from '../src/domain/ranking.ts';
import type { JobPosting } from '../src/domain/types.ts';

test('strict US remote eligibility rejects foreign, global, mixed, and unknown locations', () => {
    const { parseLocation } = createLocationMatcher(settings);
    for (const location of ['Remote - United States', 'Remote - US', 'Remote - USA', 'Remote - U.S.', 'Remote - U.S.A.', 'Seattle, WA - Remote']) {
        assert.equal(parseLocation(location).isRemoteEligible, true, location);
    }
    for (const location of ['Remote - Canada', 'Remote - India', 'Remote - Japan', 'Remote - Russia', 'Remote - US / Canada', 'Remote - US / CA', 'Remote - US & GB', 'Remote - US / Japan', 'Remote - Worldwide', 'Anywhere', 'Remote', '', 'Remote - EMEA', 'Remote - Worldwide / US']) {
        assert.equal(parseLocation(location).isRemoteEligible, false, location);
    }
    assert.equal(parseLocation('Canada', 'Senior Engineer Remote US').isRemoteEligible, false);
    assert.equal(parseLocation('Remote', 'Senior Engineer US').isRemoteEligible, false);
    assert.equal(parseLocation('Remote', '', 'USA').isRemoteEligible, true);
    assert.equal(parseLocation('Remote - Canada', '', 'USA').isRemoteEligible, false);
    assert.equal(parseLocation('Seattle, India - Remote').isLocal, false);
});

test('country aliases can be changed and mixed-country eligibility is an explicit choice', () => {
    const config = structuredClone(settings);
    config.location.country = { name: 'Canada', aliases: ['CA', 'CAN', 'Canadian'] };
    const canada = createLocationMatcher(config);
    assert.equal(canada.parseLocation('Remote - Canada').isRemoteEligible, true);
    assert.equal(canada.parseLocation('Remote - US').isRemoteEligible, false);
    assert.equal(canada.parseLocation('Remote - CA').isRemoteEligible, true);
    const multi = structuredClone(settings);
    multi.location.allowMultiCountryRemote = true;
    assert.equal(createLocationMatcher(multi).parseLocation('Remote - US / Canada').isRemoteEligible, true);
    assert.equal(createLocationMatcher(multi).parseLocation('Remote - Canada').isRemoteEligible, false);
    assert.throws(() => validateConfig({ ...settings, location: { ...settings.location, country: { name: '', aliases: [] } } }), /country.name/);
});

test('cached remote flags cannot bypass country filtering and application history remains untouched', () => {
    const base: JobPosting & { appliedAt: string } = {
        id: 'us', title: 'Senior Software Engineer', company: 'Example', url: 'https://example.com/job',
        location: 'Remote - US', description: 'TypeScript Node.js', isRemote: true,
        isLocal: false, locationScore: 0, score: 0, appliedAt: '2026-10-01T00:00:00Z',
    };
    const jobs = [base, { ...base, id: 'foreign', location: 'Remote - Canada' }, { ...base, id: 'unknown', location: 'Remote', remoteHint: true }];
    const ranked = createRanker(settings)(jobs);
    assert.deepEqual(ranked.map(job => job.id), ['us']);
    assert.equal(ranked[0].appliedAt, base.appliedAt);
    assert.equal(jobs[1].appliedAt, base.appliedAt);
});
