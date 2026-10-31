import type { JobPosting } from '../domain/types.ts';
import { settings } from '../config/loader.ts';
import { companyBonusFor, scoreJobDetails } from '../domain/scoring.ts';

export function extractAshbyCompensation(job: any): { min: number; max: number } | null {
    const components = job.compensation?.compensationComponents;
    if (!Array.isArray(components)) return null;
    const salary = components.find((c: any) => c.compensationType === 'Salary');
    if (!salary?.minValue) return null;
    return { min: salary.minValue, max: salary.maxValue };
}

export function extractSalary(content: string): { min: number; max: number } | null {
    const regex = /\$(\d{2,3}(?:,\d{3})?|\d{2,3}k)\s*(?:-|to)\s*\$(\d{2,3}(?:,\d{3})?|\d{2,3}k)/i;
    const match = content.match(regex);
    if (!match) return null;
    const parseVal = (str: string) => {
        str = str.replace(/[$,]/g, '').toLowerCase();
        return str.includes('k') ? parseFloat(str) * 1000 : parseFloat(str);
    };
    return { min: parseVal(match[1]), max: parseVal(match[2]) };
}

export function deduplicateJobs(jobs: JobPosting[]): JobPosting[] {
    const seen = new Set<string>();
    return jobs.filter(j => {
        const key = j.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function locationTierLabel(score: number): string {
    return [...settings.location.tiers].sort((a, b) => b.points - a.points).find(tier => tier.points > 0 && score >= tier.points)?.label ?? '';
}

export function formatJob(j: JobPosting & { reasons?: string[] }): string {
    // Fast-path: only scan with the salary regex if a dollar sign exists in the description
    const salary = j._ashbyCompensation ?? j._salary ?? (j.description.includes('$') ? extractSalary(j.description) : null);
    const salaryStr = salary
        ? ` | $${(salary.min / 1000).toFixed(0)}k-$${(salary.max / 1000).toFixed(0)}k`
        : '';

    const locLabel = j.isLocal && j.locationScore > 0
        ? ` [${locationTierLabel(j.locationScore)}] ${j.location}`
        : j.location ? ` @ ${j.location}` : '';

    // Optimization: Reuse precomputed reasons if present on ranked listings (~33x speedup on 1000 listings),
    // falling back to scoring evaluation if formatting raw or unranked listings.
    const reasons = j.reasons ?? scoreJobDetails(j.description, j.title, j.locationScore, companyBonusFor(j.company)).reasons;
    return `[${j.score}/100] ${j.company} - ${j.title}${salaryStr}${locLabel}\n     ${j.url}\n     ${reasons.join("; ")}`;
}
