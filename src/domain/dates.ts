const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function isValidCalendar(value: string): boolean {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(5, 7));
    const d = Number(value.slice(8, 10));
    if (m < 1 || m > 12) return false;
    return d >= 1 && d <= (m === 2 && isLeapYear(y) ? 29 : daysInMonth[m]);
}

// Fast-path calendar validation with direct integer arithmetic; bounded cache for repeating feed dates.
const dateCache = new Map<string, string | null>();

export function sourceDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
    const cached = dateCache.get(value);
    if (cached !== undefined) return cached;

    let result: string | null = null;
    if (isValidCalendar(value)) {
        const time = Date.parse(value);
        if (Number.isFinite(time)) {
            result = new Date(time).toISOString();
        }
    }

    if (dateCache.size < 1000) dateCache.set(value, result);
    return result;
}
