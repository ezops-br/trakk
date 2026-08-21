// @ts-nocheck
// Unit tests for getUpcomingEvents — the function to be added to
// google-calendar.service.ts. Existing functions are not retested here.

const mockEventsListFn = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: { list: mockEventsListFn },
    }),
  },
}));

import { getUpcomingEvents } from './google-calendar.service';

const TOKEN = 'ya29.fake-token';

const TRAKK_EVENT = {
  id: 'trakk-1',
  summary: 'Sprint Planning',
  description: null,
  start: { dateTime: '2026-06-12T14:00:00Z' },
  end: { dateTime: '2026-06-12T15:00:00Z' },
  conferenceData: {
    entryPoints: [
      { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
      { entryPointType: 'phone', uri: 'tel:+1' },
    ],
  },
  extendedProperties: { private: { trakkSource: 'true', trakkTicketId: 'ticket-1' } },
  htmlLink: 'https://calendar.google.com/event?eid=abc',
};

const ALL_DAY_EVENT = {
  id: 'allday-1',
  summary: 'Holiday',
  description: null,
  start: { date: '2026-06-12' },
  end: { date: '2026-06-13' },
  conferenceData: null,
  extendedProperties: null,
  htmlLink: 'https://calendar.google.com/event?eid=def',
};

beforeEach(() => { jest.clearAllMocks(); });

describe('getUpcomingEvents', () => {
  it('happy path: returns correct count and calls events.list with required params', async () => {
    mockEventsListFn.mockResolvedValue({ data: { items: [TRAKK_EVENT, ALL_DAY_EVENT] } });
    const events = await getUpcomingEvents(TOKEN, { maxResults: 10 });
    expect(events).toHaveLength(2);
    expect(mockEventsListFn).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'primary', singleEvents: true, orderBy: 'startTime', maxResults: 10 }),
    );
  });

  it('normalizes Trakk event: dateTime start/end, video meetLink, isTrakkEvent=true, trakkTicketId set', async () => {
    mockEventsListFn.mockResolvedValue({ data: { items: [TRAKK_EVENT] } });
    const [e] = await getUpcomingEvents(TOKEN);
    expect(e.start).toBe('2026-06-12T14:00:00Z');
    expect(e.meetLink).toBe('https://meet.google.com/abc-defg-hij');
    expect(e.isTrakkEvent).toBe(true);
    expect(e.trakkTicketId).toBe('ticket-1');
  });

  it('normalizes all-day event: date string start/end, meetLink=null, isTrakkEvent=false', async () => {
    mockEventsListFn.mockResolvedValue({ data: { items: [ALL_DAY_EVENT] } });
    const [e] = await getUpcomingEvents(TOKEN);
    expect(e.start).toBe('2026-06-12');
    expect(e.meetLink).toBeNull();
    expect(e.isTrakkEvent).toBe(false);
    expect(e.trakkTicketId).toBeNull();
  });

  it('returns empty array for no items; throws when Google API throws', async () => {
    mockEventsListFn.mockResolvedValue({ data: { items: [] } });
    expect(await getUpcomingEvents(TOKEN)).toEqual([]);

    mockEventsListFn.mockRejectedValue(new Error('API error'));
    await expect(getUpcomingEvents(TOKEN)).rejects.toThrow('API error');
  });
});
