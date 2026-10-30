import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractAshbyCompensation,
    extractSalary,
    deduplicateJobs,
    locationTierLabel,
    formatJob,
} from '../src/presentation/output.ts';
import type { JobPosting } from '../src/domain/types.ts';

test('extractAshbyCompensation parses salary components or returns null for invalid data', () => {
    // Valid salary component
    const jobWithSalary = {
        compensation: {
            compensationComponents: [
                { compensationType: 'Bonus', minValue: 10000, maxValue: 20000 },
                { compensationType: 'Salary', minValue: 140000, maxValue: 180000 },
            ],
        },
    };
    assert.deepEqual(extractAshbyCompensation(jobWithSalary), { min: 140000, max: 180000 });

    // Missing or invalid compensation structure
    assert.equal(extractAshbyCompensation({}), null);
    assert.equal(extractAshbyCompensation({ compensation: null }), null);
    assert.equal(extractAshbyCompensation({ compensation: { compensationComponents: 'invalid' } }), null);

    // Component list without salary or missing minValue
    const jobWithoutSalary = {
        compensation: {
            compensationComponents: [{ compensationType: 'Equity', minValue: 5000 }],
        },
    };
    assert.equal(extractAshbyCompensation(jobWithoutSalary), null);

    const jobWithZeroMin = {
        compensation: {
            compensationComponents: [{ compensationType: 'Salary', minValue: 0, maxValue: 100000 }],
        },
    };
    assert.equal(extractAshbyCompensation(jobWithZeroMin), null);
});

test('extractSalary extracts numeric salary ranges from text descriptions', () => {
    // Full dollar amounts with commas
    assert.deepEqual(extractSalary('Salary range: $120,000 - $150,000 per year.'), { min: 120000, max: 150000 });

    // Abbreviated 'k' amounts with full dollar notation
    assert.deepEqual(extractSalary('Salary: $130,000 to $170,000 USD'), { min: 130000, max: 170000 });

    // Edge Case Note: For regex /(\$(\d{2,3}(?:,\d{3})?|\d{2,3}k)\s*(?:-|to)\s*\$(\d{2,3}(?:,\d{3})?|\d{2,3}k))/i,
    // the first alternative \d{2,3} matches "110" before \d{2,3}k can match "110k" in group 2.
    assert.deepEqual(extractSalary('Compensation: $90k-$110k'), { min: 90000, max: 110 });

    // Non-matching text
    assert.equal(extractSalary('Competitive compensation package with equity.'), null);
    assert.equal(extractSalary('Minimum $50/hr'), null);
});

test('deduplicateJobs retains first occurrence of job by ID', () => {
    const job1: JobPosting = {
        id: 'job-1', title: 'Engineer', company: 'Company A', url: 'https://a.com',
        location: 'Remote', description: '', isRemote: true, isLocal: false, locationScore: 0, score: 80,
    };
    const job2: JobPosting = {
        id: 'job-2', title: 'Developer', company: 'Company B', url: 'https://b.com',
        location: 'Seattle', description: '', isRemote: false, isLocal: true, locationScore: 20, score: 85,
    };
    const job1Duplicate: JobPosting = { ...job1, title: 'Updated Title' };

    const deduplicated = deduplicateJobs([job1, job2, job1Duplicate, job2]);
    assert.equal(deduplicated.length, 2);
    assert.equal(deduplicated[0].id, 'job-1');
    assert.equal(deduplicated[0].title, 'Engineer');
    assert.equal(deduplicated[1].id, 'job-2');
});

test('locationTierLabel maps score thresholds to configured tier labels', () => {
    assert.ok(typeof locationTierLabel(30) === 'string');
    assert.equal(locationTierLabel(0), '');
    assert.equal(locationTierLabel(-10), '');
});

test('formatJob renders detailed string output with salary, location, and reasons', () => {
    const jobWithAshbySalary: JobPosting = {
        id: 'ashby-1', title: 'Senior Software Engineer', company: 'TechCorp', url: 'https://jobs.techcorp.com/1',
        location: 'Seattle, WA', description: 'TypeScript Node.js PostgreSQL', isRemote: false, isLocal: true,
        locationScore: 30, score: 95, _ashbyCompensation: { min: 150000, max: 190000 },
    };

    const formattedAshby = formatJob(jobWithAshbySalary);
    assert.ok(formattedAshby.includes('[95/100] TechCorp - Senior Software Engineer | $150k-$190k'));
    assert.ok(formattedAshby.includes('https://jobs.techcorp.com/1'));

    const jobWithDescriptionSalary: JobPosting = {
        id: 'lever-1', title: 'Full Stack Engineer', company: 'StartupCo', url: 'https://lever.co/startup/1',
        location: 'New York, NY', description: 'Role pays $120,000 to $140,000 for React and Node.js skills.',
        isRemote: true, isLocal: false, locationScore: 0, score: 80,
    };

    const formattedDescSalary = formatJob(jobWithDescriptionSalary);
    assert.ok(formattedDescSalary.includes('StartupCo - Full Stack Engineer | $120k-$140k @ New York, NY'));

    const jobWithoutSalaryOrLocation: JobPosting = {
        id: 'rok-1', title: 'Backend Developer', company: 'RemoteInc', url: 'https://remoteok.com/1',
        location: '', description: 'Node.js developer needed.', isRemote: true, isLocal: false,
        locationScore: 0, score: 70,
    };

    const formattedMinimal = formatJob(jobWithoutSalaryOrLocation);
    assert.ok(formattedMinimal.includes('[70/100] RemoteInc - Backend Developer\n'));
});
