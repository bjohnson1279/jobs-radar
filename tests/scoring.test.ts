import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyBonusFor, isBlocklisted, plainText, scoreJob, scoreJobDetails } from '../src/domain/scoring.ts';
import { parseLocation, locationScoreFor } from '../src/domain/location.ts';

const title = 'Senior Software Engineer';

test('preferred stacks outrank infrastructure-only and mismatched roles', () => {
    const preferred = scoreJob('TypeScript Node.js PHP', title);
    assert.ok(preferred > scoreJob('AWS PostgreSQL Kafka', title));
    for (const mismatch of ['C#', '.NET', 'ASP.NET Core', 'Ruby on Rails']) {
        assert.equal(scoreJob(`TypeScript Node.js ${mismatch}`, title), scoreJob('TypeScript Node.js', title) - 20);
    }
});

test('synonyms score once and incidental substrings do not match', () => {
    assert.equal(scoreJob('Node.js nodejs PHP Laravel Postgres PostgreSQL', title), scoreJob('Node.js PHP Postgres', title));
    assert.equal(scoreJob('paid training, email, chair, diagram', title), 13);
    assert.equal(scoreJob('Node.js', 'Senior Engineering Manager'), 0);
    assert.ok(scoreJob('Node.js', title) > scoreJob('Node.js', 'Staff Software Engineer'));

    const excludedDetails = scoreJobDetails('TypeScript Node.js AWS', 'Junior Software Engineer');
    assert.deepEqual(excludedDetails, {
        score: 0,
        rawScore: 0,
        reasons: ['Title outside preferred role'],
        pros: [],
        cons: [{ label: 'Title outside preferred role', points: 0, contribution: 0 }],
    });
});

test('culture and management signals apply independent penalties', () => {
    const baseline = scoreJob('TypeScript Node.js PHP', title);
    for (const phrase of ['fast-paced', 'fast paced', 'fast&ndash;paced', 'wear many hats', 'wearing multiple hats', 'project management', 'managing timelines']) {
        assert.equal(scoreJob(`TypeScript Node.js PHP ${phrase}`, title), 45, phrase);
    }
    const details = scoreJobDetails('<p>TypeScript</p><p>fast-paced; wear many hats</p>', title);
    assert.ok(details.reasons.includes('Fast-paced environment -12.5'));
    assert.ok(details.reasons.includes('Many hats -12.5'));
    assert.equal(scoreJob('.NET Ruby on Rails', title), 0);
});

test('company bonuses recognize board slugs and display names', () => {
    for (const company of ['EXAMPLE ENGINEERING', 'Example Co']) {
        assert.equal(companyBonusFor(company), 25, company);
    }
    assert.equal(companyBonusFor('Unknown'), 0);
    assert.equal(isBlocklisted('Example Blocked Company'), true);
    assert.equal(scoreJob('TypeScript', title, 30, companyBonusFor('Example Engineering')), 55);
});

test('configured proximity uses bounded city names and best available office', () => {
    assert.equal(locationScoreFor('Seattle, WA'), 30);
    assert.equal(locationScoreFor('Bellevue, Washington'), 30);
    assert.equal(locationScoreFor('Redmond, Washington'), 20);
    assert.equal(locationScoreFor('Kirkland, WA'), 10);
    assert.equal(locationScoreFor('Tacoma, WA'), 5);
    assert.equal(locationScoreFor('Tacoma / Seattle'), 30);
    assert.equal(parseLocation('Olympia, WA').isLocal, true);
    assert.equal(parseLocation('Sandy Springs, GA').isLocal, false);
    assert.equal(parseLocation('Oregon').isLocal, false);
});

test('remote eligibility respects country restrictions', () => {
    assert.equal(parseLocation('Remote - United States').isRemoteEligible, true);
    assert.equal(parseLocation('Remote - Canada').isRemoteEligible, false);
    assert.equal(parseLocation('Remote - US / Canada').isRemoteEligible, false);
    assert.equal(parseLocation('Anywhere').isRemoteEligible, false);
    assert.equal(parseLocation('Remote - EMEA').isRemoteEligible, false);
});

test('plainText strips HTML tags, decodes supported entities, and collapses whitespace', () => {
    // Pure text without tags or entities
    assert.equal(plainText('Simple plain text string'), 'Simple plain text string');

    // Tags removal
    assert.equal(plainText('<p>Hello <strong>World</strong>!</p>'), ' Hello World ! ');

    // Whitespace collapse (multiple spaces, tabs, newlines, carriage returns)
    assert.equal(plainText('Hello \n\t\r  world   test'), 'Hello world test');
    assert.equal(plainText('<div>Line 1</div>\n\n<div>Line 2</div>'), ' Line 1 Line 2 ');

    // Entities decoding: nbsp, #160, amp, #35, #x23, ndash, mdash, #8211, #8212
    assert.equal(plainText('Word&nbsp;Word&#160;Word&NBSP;Word'), 'Word Word Word Word');
    assert.equal(plainText('AT&amp;T &AMP; Co'), 'AT&T & Co');
    assert.equal(plainText('C&#35; and C&#x23; and C&#X23;'), 'C# and C# and C#');
    assert.equal(plainText('full&ndash;stack and full&mdash;stack'), 'full-stack and full-stack');
    assert.equal(plainText('front&#8211;end and back&#8212;end'), 'front-end and back-end');

    // Combined HTML snippet
    const htmlSnippet = '<h1>Title</h1><p>C&#35; &amp; Node.js&nbsp;&ndash;&nbsp;fast&ndash;paced</p>';
    assert.equal(plainText(htmlSnippet), ' Title C# & Node.js - fast-paced ');
});
