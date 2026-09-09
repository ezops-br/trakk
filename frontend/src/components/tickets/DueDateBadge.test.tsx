import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DueDateBadge } from '@/components/tickets/DueDateBadge';

/**
 * `vi.useFakeTimers` would shift `new Date()` everywhere, but every test in
 * this file builds the date string from a known offset relative to today —
 * the helper accepts both a literal ISO string AND a relative day offset
 * (`'-1'` = yesterday, `'1'` = tomorrow) so the test stays readable and
 * timezone-portable. The component itself uses `new Date()` only inside the
 * day-bucket math (Math.round on getTime()), which tolerates fakes cleanly.
 */
function isoOffset(days: number): string {
  const base = new Date();
  base.setDate(base.getDate() + days);
  // Match the wire format: UTC midnight ISO string.
  return new Date(Date.UTC(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
  )).toISOString();
}

describe('DueDateBadge', () => {
  it('renders nothing when dueDate is null', () => {
    const { container } = render(<DueDateBadge dueDate={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when dueDate is an invalid string', () => {
    const { container } = render(<DueDateBadge dueDate={'not-a-date'} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the formatted long date and Calendar icon when dueDate is a future ISO string', () => {
    render(<DueDateBadge dueDate={isoOffset(7)} />);

    // The non-compact variant formats as e.g. "Aug 15, 2024" — assert any
    // non-empty year-bearing string is rendered; the exact format is owned by
    // Intl.DateTimeFormat and tested by the format helper shape, not here.
    expect(screen.getByText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)).toBeInTheDocument();

    // Calendar icon is rendered as an SVG (aria-hidden) — assert an SVG is present.
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('applies the overdue color class when dueDate is yesterday', () => {
    render(<DueDateBadge dueDate={isoOffset(-1)} />);

    const badge = document.querySelector('span.inline-flex');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('text-status-error');
    expect(badge!.className).toContain('border-status-error');
    expect(badge!.className).toContain('bg-status-error');
  });

  it('applies the within-48h color class when dueDate is 1 day from now', () => {
    render(<DueDateBadge dueDate={isoOffset(1)} />);

    const badge = document.querySelector('span.inline-flex');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('text-status-warning');
    expect(badge!.className).toContain('border-status-warning');
    expect(badge!.className).toContain('bg-status-warning');
  });

  it('applies the neutral color class when dueDate is far in the future', () => {
    render(<DueDateBadge dueDate={isoOffset(30)} />);

    const badge = document.querySelector('span.inline-flex');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('text-trakk-text-secondary');
    expect(badge!.className).toContain('border-trakk-border');
    expect(badge!.className).toContain('bg-trakk-surface');
  });

  it('compact variant renders the short "MMM d" format without uppercase styling', () => {
    render(<DueDateBadge dueDate={isoOffset(7)} compact />);

    // Short format: "Aug 15" — no comma, no year.
    expect(screen.getByText(/[A-Z][a-z]{2} \d{1,2}$/)).toBeInTheDocument();

    // The compact variant must NOT carry the long variant's uppercase tracking
    // — the brief pins the difference here.
    const badge = document.querySelector('span.inline-flex');
    expect(badge).not.toBeNull();
    expect(badge!.className).not.toContain('uppercase');
  });
});