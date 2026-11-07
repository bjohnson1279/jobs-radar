import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceDate } from '../src/domain/dates.ts';

test('sourceDate: rejects non-string and malformed date strings', () => {
    // Non-string types
    assert.equal(sourceDate(undefined), null);
    assert.equal(sourceDate(null), null);
    assert.equal(sourceDate(1234567890), null);
    assert.equal(sourceDate(true), null);
    assert.equal(sourceDate({}), null);
    assert.equal(sourceDate([]), null);

    // Malformed strings that do not start with YYYY-MM-DD(T|$)
    assert.equal(sourceDate(''), null);
    assert.equal(sourceDate('2 days ago'), null);
    assert.equal(sourceDate('yesterday'), null);
    assert.equal(sourceDate('2026/09/01'), null);
    assert.equal(sourceDate('09-01-2026'), null);
    assert.equal(sourceDate('2026-9-1'), null);
    assert.equal(sourceDate('2026-09-01 extra'), null);
    assert.equal(sourceDate('not-a-date-2026-09-01'), null);
});

test('sourceDate: validates calendar month and day boundary edge cases', () => {
    // Month boundaries: valid 01 and 12, invalid 00 and 13
    assert.equal(sourceDate('2026-01-15'), '2026-01-15T00:00:00.000Z');
    assert.equal(sourceDate('2026-12-31'), '2026-12-31T00:00:00.000Z');
    assert.equal(sourceDate('2026-00-15'), null);
    assert.equal(sourceDate('2026-13-01'), null);

    // Day boundaries: invalid 00 and >31
    assert.equal(sourceDate('2026-01-00'), null);
    assert.equal(sourceDate('2026-01-32'), null);

    // 30-day vs 31-day months
    assert.equal(sourceDate('2026-04-30'), '2026-04-30T00:00:00.000Z');
    assert.equal(sourceDate('2026-04-31'), null); // April has 30 days
    assert.equal(sourceDate('2026-06-30'), '2026-06-30T00:00:00.000Z');
    assert.equal(sourceDate('2026-06-31'), null); // June has 30 days
    assert.equal(sourceDate('2026-09-30'), '2026-09-30T00:00:00.000Z');
    assert.equal(sourceDate('2026-09-31'), null); // September has 30 days
    assert.equal(sourceDate('2026-11-30'), '2026-11-30T00:00:00.000Z');
    assert.equal(sourceDate('2026-11-31'), null); // November has 30 days
});

test('sourceDate: enforces leap year rules across boundary years', () => {
    // Non-leap year: February 28 is valid, 29 and 30 are invalid
    assert.equal(sourceDate('2023-02-28'), '2023-02-28T00:00:00.000Z');
    assert.equal(sourceDate('2023-02-29'), null);
    assert.equal(sourceDate('2023-02-30'), null);

    // Standard leap year (divisible by 4): 2024
    assert.equal(sourceDate('2024-02-28'), '2024-02-28T00:00:00.000Z');
    assert.equal(sourceDate('2024-02-29'), '2024-02-29T00:00:00.000Z');
    assert.equal(sourceDate('2024-02-30'), null);

    // Century non-leap year (divisible by 100 but not 400): 1900, 2100
    assert.equal(sourceDate('1900-02-28'), '1900-02-28T00:00:00.000Z');
    assert.equal(sourceDate('1900-02-29'), null);
    assert.equal(sourceDate('2100-02-29'), null);

    // 400-year leap year (divisible by 400): 2000
    assert.equal(sourceDate('2000-02-28'), '2000-02-28T00:00:00.000Z');
    assert.equal(sourceDate('2000-02-29'), '2000-02-29T00:00:00.000Z');
    assert.equal(sourceDate('2000-02-30'), null);
});

test('sourceDate: handles time portions, offsets, invalid times, and caching', () => {
    // Date only string converts to midnight UTC
    assert.equal(sourceDate('2026-09-01'), '2026-09-01T00:00:00.000Z');

    // ISO timestamp with UTC 'Z'
    assert.equal(sourceDate('2026-09-01T12:30:00Z'), '2026-09-01T12:30:00.000Z');
    assert.equal(sourceDate('2026-09-01T12:30:00.000Z'), '2026-09-01T12:30:00.000Z');

    // Timezone offsets convert to UTC correctly
    assert.equal(sourceDate('2026-09-01T12:00:00-06:00'), '2026-09-01T18:00:00.000Z');
    assert.equal(sourceDate('2026-09-01T12:00:00+02:00'), '2026-09-01T10:00:00.000Z');

    // Invalid time component after valid calendar prefix
    assert.equal(sourceDate('2026-09-01Tinvalid'), null);
    assert.equal(sourceDate('2026-09-01T99:99:99Z'), null);

    // Cache hit behavior: repeated queries return identical result from cache
    const repeatedDate = '2026-09-01T15:00:00Z';
    const firstCall = sourceDate(repeatedDate);
    const secondCall = sourceDate(repeatedDate);
    assert.equal(firstCall, '2026-09-01T15:00:00.000Z');
    assert.equal(secondCall, firstCall);

    const repeatedInvalid = '2026-02-31';
    assert.equal(sourceDate(repeatedInvalid), null);
    assert.equal(sourceDate(repeatedInvalid), null);
});
