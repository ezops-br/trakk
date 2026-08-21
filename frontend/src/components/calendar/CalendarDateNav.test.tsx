import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CalendarDateNav } from './CalendarDateNav';

const TODAY = '2026-06-12';
const OTHER_DATE = '2026-06-15';

const MOCK_GO_PREV = vi.fn();
const MOCK_GO_NEXT = vi.fn();
const MOCK_GO_TODAY = vi.fn();

beforeEach(() => { vi.clearAllMocks(); });

function renderNav(selectedDate: string) {
  render(
    <CalendarDateNav
      selectedDate={selectedDate}
      today={TODAY}
      onPrev={MOCK_GO_PREV}
      onNext={MOCK_GO_NEXT}
      onToday={MOCK_GO_TODAY}
    />,
  );
}

describe('CalendarDateNav', () => {
  it('shows "Today" label and disabled Today button when on today', () => {
    renderNav(TODAY);
    // Both the date label span and the "Today" button contain "Today" — use getAllByText
    expect(screen.getAllByText('Today').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /today/i }).hasAttribute('disabled')).toBe(true);
  });

  it('Today button is enabled and onToday is called when not on today', () => {
    renderNav(OTHER_DATE);
    const todayBtn = screen.getByRole('button', { name: /today/i });
    expect(todayBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(todayBtn);
    expect(MOCK_GO_TODAY).toHaveBeenCalledTimes(1);
  });

  it('prev/next buttons call onPrev and onNext respectively', () => {
    renderNav(TODAY);
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(MOCK_GO_PREV).toHaveBeenCalledTimes(1);
    expect(MOCK_GO_NEXT).toHaveBeenCalledTimes(1);
  });
});
