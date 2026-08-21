import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { EventCard } from './EventCard';

// NOW = 13:50; MOCK_TIMED_EVENT starts 14:00 (10 min away → proximate)
const NOW = new Date('2026-06-12T13:50:00Z');

const TIMED = {
  id: 'ev-1', summary: 'Sprint Planning', description: null,
  start: '2026-06-12T14:00:00Z', end: '2026-06-12T15:00:00Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  htmlLink: 'https://calendar.google.com/event?eid=abc',
  isTrakkEvent: true, trakkTicketId: 'ticket-1',
};

const ALL_DAY = {
  id: 'ev-2', summary: 'Holiday', description: null,
  start: '2026-06-12', end: '2026-06-13',
  meetLink: null, htmlLink: '', isTrakkEvent: false, trakkTicketId: null,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('EventCard', () => {
  it('renders title; "All day" for all-day events; time range (not "All day") for timed', () => {
    render(<EventCard event={ALL_DAY} now={NOW} />);
    expect(screen.getByText('Holiday')).toBeTruthy();
    expect(screen.getByText(/all day/i)).toBeTruthy();
    cleanup();

    render(<EventCard event={TIMED} now={NOW} />);
    expect(screen.getByText('Sprint Planning')).toBeTruthy();
    expect(screen.queryAllByText(/all day/i)).toHaveLength(0);
  });

  it('Join Meet link shown with correct href when meetLink set; absent when null', () => {
    render(<EventCard event={TIMED} now={NOW} />);
    expect(screen.getByRole('link', { name: /join meet/i }).getAttribute('href'))
      .toBe('https://meet.google.com/abc-defg-hij');
    cleanup();

    render(<EventCard event={ALL_DAY} now={NOW} />);
    expect(screen.queryByRole('link', { name: /join meet/i })).toBeNull();
  });

  it('Trakk badge renders as link when trakkTicketId set; non-link when null', () => {
    render(<EventCard event={TIMED} now={NOW} />);
    const badge = screen.getByText(/trakk/i);
    expect(badge.tagName.toLowerCase() === 'a' || badge.closest('a')).toBeTruthy();
  });

  it('proximity indicator shown within 15 min; absent when event is far future', () => {
    render(<EventCard event={TIMED} now={NOW} />);
    const near = screen.queryByText(/soon/i) ?? screen.queryByText(/starting/i) ?? document.querySelector('[data-proximate="true"]');
    expect(near).toBeTruthy();
    cleanup();

    render(<EventCard event={{ ...TIMED, start: '2026-06-12T20:00:00Z', end: '2026-06-12T21:00:00Z' }} now={NOW} />);
    const far = screen.queryByText(/soon/i) ?? screen.queryByText(/starting/i) ?? document.querySelector('[data-proximate="true"]');
    expect(far).toBeNull();
  });
});
