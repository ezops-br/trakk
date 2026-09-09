'use client';

import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

type DueDateBadgeProps = {
  dueDate: string | null;
  compact?: boolean;
};

/**
 * Formats a date as "Aug 15" (short, locale-agnostic, no time-of-day).
 * Used by the `compact` variant on the board card footer.
 */
function formatShortDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(value);
}

/**
 * Formats a date as "Aug 15, 2024" (long, locale-agnostic, no time-of-day).
 * Used by the non-compact variant on the detail sheet.
 */
function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value);
}

/**
 * Normalize a Date to local-midnight so day-level comparisons
 * are timezone-independent.
 */
function toLocalMidnight(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function DueDateBadge({ dueDate, compact = false }: DueDateBadgeProps) {
  if (!dueDate) {
    return null;
  }

  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const todayMidnight = toLocalMidnight(new Date());
  const dueMidnight = toLocalMidnight(date);
  const dayDelta = Math.round((dueMidnight - todayMidnight) / 86_400_000);

  let colorClass = 'text-trakk-text-secondary border-trakk-border bg-trakk-surface';
  if (dayDelta < 0) {
    colorClass = 'text-status-error border-status-error/40 bg-status-error/10';
  } else if (dayDelta <= 2) {
    colorClass = 'text-status-warning border-status-warning/40 bg-status-warning/10';
  }

  const label = compact ? formatShortDate(date) : formatLongDate(date);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge border font-mono tracking-[1px] px-1.5 py-0.5',
        compact ? 'text-[10px]' : 'text-[10px] uppercase',
        colorClass,
      )}
    >
      <Calendar size={compact ? 11 : 12} aria-hidden="true" />
      {label}
    </span>
  );
}