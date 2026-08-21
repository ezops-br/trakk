import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MeetingWithOrganizer } from '@/lib/types';

vi.mock('@/components/meetings/ScheduleMeetingDialog', () => ({
  ScheduleMeetingDialog: () => null,
}));

import { MeetingCard } from './MeetingCard';

const ORGANIZER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
const OTHER_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f01234567890';
const PROJECT_ID = 'c3d4e5f6-a7b8-9012-cdef-012345678901';

const MEETING: MeetingWithOrganizer = {
  id: 'd4e5f6a7-b8c9-0123-defa-123456789012',
  ticketId: 'e5f6a7b8-c9d0-1234-efab-234567890123',
  organizerId: ORGANIZER_ID,
  title: 'Sprint Planning',
  startTime: '2026-06-15T14:00:00.000Z',
  endTime: '2026-06-15T15:00:00.000Z',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  createdAt: '2026-06-10T10:00:00.000Z',
  updatedAt: '2026-06-10T10:00:00.000Z',
  organizer: {
    id: ORGANIZER_ID,
    displayName: 'Alice Organizer',
    avatarUrl: null,
  },
};

const MOCK_ON_UPDATE = vi.fn();
const MOCK_ON_CANCEL = vi.fn();

const DEFAULT_PROPS = {
  meeting: MEETING,
  projectId: PROJECT_ID,
  ticketNumber: 42,
  onUpdate: MOCK_ON_UPDATE,
  onCancel: MOCK_ON_CANCEL,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MeetingCard', () => {
  it('renders meeting title, time, organizer, and Join Meet link', () => {
    // Arrange & Act
    render(
      <MeetingCard
        {...DEFAULT_PROPS}
        currentUserId={OTHER_USER_ID}
        projectRole="VIEWER"
      />,
    );

    // Assert — title visible
    expect(screen.getByText('Sprint Planning')).toBeTruthy();

    // Assert — organizer visible
    expect(screen.getByText('Alice Organizer')).toBeTruthy();

    // Assert — Join Meet link present with correct href
    const joinLink = screen.getByRole('link', { name: /join meet/i });
    expect(joinLink).toBeTruthy();
    expect(joinLink.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('shows Reschedule and Cancel buttons when user is the organizer', () => {
    // Arrange & Act — currentUserId matches meeting.organizerId
    render(
      <MeetingCard
        {...DEFAULT_PROPS}
        currentUserId={ORGANIZER_ID}
        projectRole="MEMBER"
      />,
    );

    // Assert
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('shows Reschedule and Cancel buttons when user is OWNER', () => {
    // Arrange & Act — different userId but OWNER role
    render(
      <MeetingCard
        {...DEFAULT_PROPS}
        currentUserId={OTHER_USER_ID}
        projectRole="OWNER"
      />,
    );

    // Assert
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('hides action buttons for MEMBER who is not the organizer', () => {
    // Arrange & Act
    render(
      <MeetingCard
        {...DEFAULT_PROPS}
        currentUserId={OTHER_USER_ID}
        projectRole="MEMBER"
      />,
    );

    // Assert — neither action button should be present
    expect(screen.queryByRole('button', { name: /reschedule/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
  });

  it('calls onCancel with meeting id when Cancel is confirmed', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    MOCK_ON_CANCEL.mockResolvedValue(undefined);

    render(
      <MeetingCard
        {...DEFAULT_PROPS}
        currentUserId={ORGANIZER_ID}
        projectRole="MEMBER"
      />,
    );

    // Act
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Assert — onCancel called with the meeting's id
    await vi.waitFor(() => {
      expect(MOCK_ON_CANCEL).toHaveBeenCalledWith(MEETING.id);
    });
  });
});
