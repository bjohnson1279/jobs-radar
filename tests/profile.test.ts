import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTitle } from '../src/domain/filters.ts';
import { settings } from '../src/config/loader.ts';
import { createScorer, scoreJob, scoreJobDetails } from '../src/domain/scoring.ts';

test('example title filters support software, full-stack, integration, and architecture', () => {
    for (const title of [
        'Senior Software Engineer', 'Senior Web Developer', 'Software Developer 5',
        'Senior Backend Engineer', 'Senior Full-Stack Developer', 'API Integration Engineer',
        'Application Developer', 'Senior API Engineer', 'Software Architect', 'Systems Architect', 'Technical Architect',
        'Staff Software Engineer', 'Principal Software Engineer', 'Lead Developer',
        'Senior React Engineer', 'Senior Frontend Engineer', 'Senior Data Engineer',
        'Senior Node.js Engineer', 'Senior PHP Developer', 'Software Engineer III',
    ]) assert.equal(matchesTitle(title), true, title);
    for (const title of [
        'Engineering Manager', 'Software Development Manager', 'Technical Project Manager',
        'Junior Software Engineer', 'Software Engineering Intern', 'Senior Mechanical Engineer',
        'Site Reliability Engineer', 'DevOps Engineer', 'Machine Learning Engineer',
        'React Native Developer', 'Senior Android Developer', 'Sales Engineer',
    ]) assert.equal(matchesTitle(title), false, title);
});

test('full-stack, modernization, and verification rules contribute to fit', () => {
    const title = 'Senior Software Engineer';
    const baseline = scoreJob('TypeScript Node.js', title);
    const strong = scoreJobDetails('TypeScript Node.js React serverless AWS legacy modernization DDD GraphQL state machines contract tests', title);
    assert.ok(strong.score > baseline);
    for (const signal of ['React / Angular web applications', 'Legacy modernization', 'TDD / automated verification']) {
        assert.ok(strong.pros.some(item => item.label === signal), signal);
    }
    assert.ok(scoreJob('TypeScript Node.js React', 'Senior Full-Stack Engineer') > scoreJob('TypeScript Node.js React', 'Senior Frontend Engineer'));
    assert.ok(scoreJob('TypeScript Node.js AWS ETL', 'Senior Backend Engineer') > scoreJob('TypeScript Node.js AWS ETL', 'Senior Data Engineer'));
});

test('legacy Java references are distinguished from explicit primary requirements', () => {
    const title = 'Senior Software Engineer';
    const modernization = scoreJobDetails('Migrate a legacy Java/Spring monolith to Node.js TypeScript services.', title);
    assert.equal(modernization.cons.some(item => item.label === 'Primary Java / Spring requirements'), false);
    assert.ok(modernization.pros.some(item => item.label === 'Legacy modernization'));
    assert.ok(scoreJob('TypeScript Node.js Java required', title) < scoreJob('TypeScript Node.js', title));
    assert.ok(scoreJob('TypeScript Node.js', 'Senior Java Engineer') < scoreJob('TypeScript Node.js', title));
    assert.ok(scoreJob('TypeScript Node.js mentor developers', title) > scoreJob('TypeScript Node.js project management', title));
});

test('additional technology signals can be supplied by configuration', () => {
    const title = 'Senior Software Engineer';
    assert.equal(scoreJob('AI LLM embeddings', title), scoreJob('', title));
    const config = structuredClone(settings);
    config.scoring.rules.push({ label: 'Example custom skill', pattern: 'custom skill', points: 20, scope: 'content' });
    assert.ok(createScorer(config).scoreJob('custom skill', title) > scoreJob('', title));
});
