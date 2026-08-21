import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-calendar', () => ({
  useCalendar: vi.fn(),
  todayString: () => '2026-06-12',
}));
vi.mock('@/components/calendar/EventCard', () => ({
  EventCard: ({ event }: { event: { summary: string } }) => (
    <div data-testid="event-card">{event.summary}</div>
  ),
}));
vi.mock('@/components/calendar/CalendarDateNav', () => ({
  CalendarDateNav: () => <div data-testid="date-nav" />,
}));

import { CalendarSidebar } from './CalendarSidebar';
import { useCalendar } from '@/hooks/use-calendar';

const mockUseCalendar = useCalendar as ReturnType<typeof vi.fn>;

const BASE = {
  events: [], loading: false, error: null,
  calendarConnected: true, needsReauth: false, selectedDate: '2026-06-12',
  goToPrevDay: vi.fn(), goToNextDay: vi.fn(), goToToday: vi.fn(), refetch: vi.fn(),
};

const EVENTS = [
  { id: 'e1', summary: 'Sprint Planning', start: '2026-06-12T14:00:00Z', end: '2026-06-12T15:00:00Z',
    description: null, meetLink: null, htmlLink: '', isTrakkEvent: false, trakkTicketId: null },
];

beforeEach(() => { vi.clearAllMocks(); });

describe('CalendarSidebar', () => {
  it('loading state: no event cards, no error/empty text, DateNav present', () => {
    mockUseCalendar.mockReturnValue({ ...BASE, loading: true });
    render(<CalendarSidebar />);
    expect(screen.queryByTestId('event-card')).toBeNull();
    expect(screen.queryByText(/no events/i)).toBeNull();
    expect(screen.getByTestId('date-nav')).toBeTruthy();
  });

  it('no-account state: shows connect-Google prompt', () => {
    mockUseCalendar.mockReturnValue({ ...BASE, calendarConnected: false });
    render(<CalendarSidebar />);
    expect(screen.getByText(/connect your google calendar/i)).toBeTruthy();
  });

  it('needsReauth state shows reconnect prompt; empty connected state shows no-events', () => {
    mockUseCalendar.mockReturnValue({ ...BASE, calendarConnected: false, needsReauth: true });
    render(<CalendarSidebar />);
    expect(screen.getByText(/reconnect/i)).toBeTruthy();

    mockUseCalendar.mockReturnValue({ ...BASE });
    render(<CalendarSidebar />);
    expect(screen.getByText(/no events/i)).toBeTruthy();
  });

  it('data state: renders one EventCard per event', () => {
    mockUseCalendar.mockReturnValue({ ...BASE, events: EVENTS });
    render(<CalendarSidebar />);
    expect(screen.getAllByTestId('event-card')).toHaveLength(1);
    expect(screen.getByText('Sprint Planning')).toBeTruthy();
  });
});
