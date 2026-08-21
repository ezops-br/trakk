"use client";

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarDateNavProps {
  selectedDate: string;  // YYYY-MM-DD
  today: string;         // YYYY-MM-DD (today's date, for comparison)
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CalendarDateNav({
  selectedDate,
  today,
  onPrev,
  onNext,
  onToday,
}: CalendarDateNavProps) {
  const isToday = selectedDate === today;

  const formattedDate = isToday
    ? 'Today'
    : new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(selectedDate + 'T00:00:00Z'));

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-trakk-border">
      <button
        aria-label="Previous day"
        onClick={onPrev}
        className="p-1 rounded hover:bg-trakk-surface-alt text-trakk-text-muted hover:text-trakk-text transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="flex-1 text-center text-sm font-medium text-trakk-text">
        {formattedDate}
      </span>

      <button
        aria-label="Next day"
        onClick={onNext}
        className="p-1 rounded hover:bg-trakk-surface-alt text-trakk-text-muted hover:text-trakk-text transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <button
        aria-label="Today"
        onClick={onToday}
        disabled={isToday}
        className="text-xs px-2 py-1 rounded font-medium text-trakk-accent hover:bg-trakk-surface-alt disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Today
      </button>
    </div>
  );
}
