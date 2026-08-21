import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
  apiClient: { get: vi.fn() },
}));

import { useCalendar, isAllDay, isProximate, offsetDate, todayString } from '@/hooks/use-calendar';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_EVENT = {
  id: 'event-1', summary: 'Sprint Planning', description: null,
  start: '2026-06-12T14:00:00Z', end: '2026-06-12T15:00:00Z',
  meetLink: null, htmlLink: '', isTrakkEvent: false, trakkTicketId: null,
};

beforeEach(() => { vi.clearAllMocks(); });

// ─── Utilities (3 tests) ──────────────────────────────────────────────────────

describe('utilities', () => {
  it('isAllDay: true for YYYY-MM-DD, false for dateTime', () => {
    expect(isAllDay({ start: '2026-06-12' } as any)).toBe(true);
    expect(isAllDay({ start: '2026-06-12T14:00:00Z' } as any)).toBe(false);
  });

  it('isProximate: false all-day; true ≤15 min; false >15 min or past', () => {
    const ev = { start: '2026-06-12T14:00:00Z' } as any;
    expect(isProximate({ start: '2026-06-12' } as any, new Date('2026-06-12T00:00:00Z'))).toBe(false);
    expect(isProximate(ev, new Date('2026-06-12T13:45:00Z'))).toBe(true);   // exactly 15 min
    expect(isProximate(ev, new Date('2026-06-12T13:44:59Z'))).toBe(false);  // 15 min + 1 s
    expect(isProximate(ev, new Date('2026-06-12T15:00:00Z'))).toBe(false);  // past
  });

  it('offsetDate handles +1, -1, and month boundary; todayString returns YYYY-MM-DD', () => {
    expect(offsetDate('2026-06-12', 1)).toBe('2026-06-13');
    expect(offsetDate('2026-06-12', -1)).toBe('2026-06-11');
    expect(offsetDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── useCalendar hook (7 tests) ───────────────────────────────────────────────

describe('useCalendar', () => {
  it('initial state: loading=true, events=[], calendarConnected=false, no error/needsReauth', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCalendar());
    expect(result.current.loading).toBe(true);
    expect(result.current.events).toEqual([]);
    expect(result.current.calendarConnected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.needsReauth).toBe(false);
  });

  it('successful fetch: events populated, calendarConnected=true, loading false', async () => {
    mockGet.mockResolvedValue({ events: [MOCK_EVENT], calendarConnected: true });
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(1);
    expect(result.current.calendarConnected).toBe(true);
  });

  it('needsReauth flag and error field are forwarded from API payload', async () => {
    mockGet.mockResolvedValue({ events: [], calendarConnected: false, needsReauth: true });
    const { result: r1 } = renderHook(() => useCalendar());
    await waitFor(() => expect(r1.current.needsReauth).toBe(true));

    mockGet.mockResolvedValue({ events: [], calendarConnected: true, error: 'Calendar temporarily unavailable' });
    const { result: r2 } = renderHook(() => useCalendar());
    await waitFor(() => expect(r2.current.error).toBe('Calendar temporarily unavailable'));
  });

  it('goToNextDay advances selectedDate and triggers re-fetch', async () => {
    mockGet.mockResolvedValue({ events: [], calendarConnected: true });
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initial = result.current.selectedDate;
    act(() => { result.current.goToNextDay(); });
    await waitFor(() => expect(result.current.selectedDate).toBe(offsetDate(initial, 1)));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('cache: revisiting a date does not re-fetch', async () => {
    mockGet.mockResolvedValue({ events: [], calendarConnected: true });
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsAfter = mockGet.mock.calls.length;
    act(() => { result.current.goToPrevDay(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.goToNextDay(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Only 1 more fetch (prev day); returning to original date is served from cache
    expect(mockGet.mock.calls.length).toBe(callsAfter + 1);
  });

  it('refetch() bypasses cache and makes a new request', async () => {
    mockGet
      .mockResolvedValueOnce({ events: [MOCK_EVENT], calendarConnected: true })
      .mockResolvedValueOnce({ events: [], calendarConnected: true });
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.refetch(); });
    await waitFor(() => expect(result.current.events).toHaveLength(0));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

});
