import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatAbsoluteDateTime,
} from '@/lib/utils';

describe('formatDate — regression guard (TRAKK-014)', () => {
  it('produces the date-only form for a known fixed timestamp', () => {
    // Locked by round-2 user decision: formatDate stays date-only.
    // If this test fails, someone re-extended formatDate against the round-2
    // decision; revert that change.
    expect(formatDate(new Date('2026-10-07T14:32:00Z'))).toBe('Oct 7, 2026');
  });

  it('accepts a string timestamp as well', () => {
    expect(formatDate('2026-10-07T14:32:00Z')).toBe('Oct 7, 2026');
  });

  it('does not include any time-of-day component', () => {
    // Belt-and-braces guard: even if the date format drifts, the output must
    // never include a time-of-day marker (no AM/PM, no HH:MM).
    const result = formatDate(new Date('2026-10-07T14:32:00Z'));
    expect(result).not.toMatch(/(AM|PM|:)/);
  });
});

describe('formatAbsoluteDateTime — TRAKK-014', () => {
  it('produces the time-of-day form for a known fixed timestamp', () => {
    // The brief accepts "Oct 7, 2026, 02:32 PM or whatever the locale yields
    // for 2026-10-07T14:32:00Z". The sandbox runs in UTC, so the literal
    // expected value is the brief's primary form. Date part is locked.
    expect(formatAbsoluteDateTime(new Date('2026-10-07T14:32:00Z'))).toBe(
      'Oct 7, 2026, 02:32 PM',
    );
  });

  it('accepts a string timestamp as well', () => {
    expect(formatAbsoluteDateTime('2026-10-07T14:32:00Z')).toBe(
      'Oct 7, 2026, 02:32 PM',
    );
  });
});