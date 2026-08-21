import { google } from 'googleapis';
import { AppError } from '../lib/app-error';

// Deletes a Google Calendar event from the user's primary calendar.
// Throws on API error — the caller is responsible for swallowing failures.
export async function deleteCalendarEvent(
  accessToken: string,
  googleEventId: string,
): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
}

// Creates a Google Calendar event with a Google Meet link on the user's primary calendar.
// Polls up to 3 times if the Meet link is not immediately provisioned.
// Throws AppError(502) if the Meet link cannot be provisioned after all retries.
export async function createCalendarEvent(
  accessToken: string,
  input: {
    title: string;
    startTime: Date;
    endTime: Date;
    attendeeEmails?: string[];
    trakkTicketId: string;
    trakkProjectId?: string;
  },
): Promise<{ googleEventId: string; meetLink: string }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary: input.title,
      start: { dateTime: input.startTime.toISOString(), timeZone: 'UTC' },
      end: { dateTime: input.endTime.toISOString(), timeZone: 'UTC' },
      attendees: input.attendeeEmails?.map(email => ({ email })) ?? [],
      conferenceData: {
        createRequest: {
          requestId: `trakk-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      extendedProperties: {
        private: {
          trakkSource: 'true',
          trakkTicketId: input.trakkTicketId,
          ...(input.trakkProjectId ? { trakkProjectId: input.trakkProjectId } : {}),
        },
      },
    },
  });

  const googleEventId = data.id!;
  let meetLink = data.conferenceData?.entryPoints?.[0]?.uri;

  // Poll up to 3 times with 1000ms delays if Meet link not immediately available
  if (!meetLink) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: pollData } = await calendar.events.get({
        calendarId: 'primary',
        eventId: googleEventId,
      });
      meetLink = pollData.conferenceData?.entryPoints?.[0]?.uri;
      if (meetLink) break;
    }
  }

  if (!meetLink) {
    // Clean up the orphaned event before throwing
    try {
      await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
    } catch (err) {
      console.warn('[createCalendarEvent] Failed to clean up orphaned event:', err);
    }
    throw new AppError(502, 'Could not provision Google Meet link. Please try again.');
  }

  return { googleEventId, meetLink };
}

export interface CalendarEventNormalized {
  id: string;
  summary: string | null;
  description: string | null;
  start: string;
  end: string;
  meetLink: string | null;
  htmlLink: string;
  isTrakkEvent: boolean;
  trakkTicketId: string | null;
  trakkProjectId: string | null;
}

// Returns upcoming events from the user's primary Google Calendar for a given date.
// Throws on API error — the caller owns error handling.
export async function getUpcomingEvents(
  accessToken: string,
  options?: { date?: string; maxResults?: number },
): Promise<CalendarEventNormalized[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const date = options?.date ?? new Date().toISOString().slice(0, 10);
  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults: options?.maxResults ?? 20,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = data.items ?? [];
  return items.map(event => {
    const videoEntry = event.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video',
    );
    return {
      id: event.id ?? '',
      summary: event.summary ?? null,
      description: event.description ?? null,
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
      meetLink: videoEntry?.uri ?? null,
      htmlLink: event.htmlLink ?? '',
      isTrakkEvent: event.extendedProperties?.private?.['trakkSource'] === 'true',
      trakkTicketId: event.extendedProperties?.private?.['trakkTicketId'] ?? null,
      trakkProjectId: event.extendedProperties?.private?.['trakkProjectId'] ?? null,
    };
  });
}

// Updates fields on an existing Google Calendar event.
// Only updates fields that are present in the updates object.
// Throws on API error — the caller is responsible for swallowing failures.
export async function updateCalendarEvent(
  accessToken: string,
  googleEventId: string,
  updates: {
    title?: string;
    startTime?: Date;
    endTime?: Date;
  },
): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const patchBody: Record<string, unknown> = {};
  if (updates.title !== undefined) {
    patchBody['summary'] = updates.title;
  }
  if (updates.startTime !== undefined) {
    patchBody['start'] = { dateTime: updates.startTime.toISOString(), timeZone: 'UTC' };
  }
  if (updates.endTime !== undefined) {
    patchBody['end'] = { dateTime: updates.endTime.toISOString(), timeZone: 'UTC' };
  }

  await calendar.events.patch({
    calendarId: 'primary',
    eventId: googleEventId,
    requestBody: patchBody,
  });
}
