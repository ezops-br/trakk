import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MeetingWithOrganizer } from '@/lib/types';

import { QuickMeetButton } from './QuickMeetButton';

const ORGANIZER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';

const MOCK_MEETING: MeetingWithOrganizer = {
  id: 'd4e5f6a7-b8c9-0123-defa-123456789012',
  ticketId: 'e5f6a7b8-c9d0-1234-efab-234567890123',
  organizerId: ORGANIZER_ID,
  title: 'Quick Meet',
  startTime: '2026-06-15T14:00:00.000Z',
  endTime: '2026-06-15T14:30:00.000Z',
  meetLink: 'https://meet.google.com/xxx-yyyy-zzz',
  createdAt: '2026-06-10T10:00:00.000Z',
  updatedAt: '2026-06-10T10:00:00.000Z',
  organizer: {
    id: ORGANIZER_ID,
    displayName: 'Alice Organizer',
    avatarUrl: null,
  },
};

const MOCK_ON_QUICK_MEET = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QuickMeetButton', () => {
  it('renders the Quick Meet button for MEMBER role', () => {
    // Arrange & Act
    render(
      <QuickMeetButton projectRole="MEMBER" onQuickMeet={MOCK_ON_QUICK_MEET} />,
    );

    // Assert
    expect(screen.getByRole('button', { name: /quick meet/i })).toBeTruthy();
  });

  it('returns null / renders nothing for VIEWER role', () => {
    // Arrange & Act
    render(
      <QuickMeetButton projectRole="VIEWER" onQuickMeet={MOCK_ON_QUICK_MEET} />,
    );

    // Assert — button must not be in the document
    expect(screen.queryByRole('button', { name: /quick meet/i })).toBeNull();
  });

  it('calls onQuickMeet and opens the Meet link on success', async () => {
    // Arrange
    MOCK_ON_QUICK_MEET.mockResolvedValue(MOCK_MEETING);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <QuickMeetButton projectRole="MEMBER" onQuickMeet={MOCK_ON_QUICK_MEET} />,
    );

    // Act
    fireEvent.click(screen.getByRole('button', { name: /quick meet/i }));

    // Assert — window.open called with the meet link
    await waitFor(() => {
      expect(MOCK_ON_QUICK_MEET).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        'https://meet.google.com/xxx-yyyy-zzz',
        '_blank',
        'noopener,noreferrer',
      );
    });

    openSpy.mockRestore();
  });

  it('shows error message on failure', async () => {
    // Arrange
    MOCK_ON_QUICK_MEET.mockRejectedValue(new Error('Network error'));

    render(
      <QuickMeetButton projectRole="OWNER" onQuickMeet={MOCK_ON_QUICK_MEET} />,
    );

    // Act
    fireEvent.click(screen.getByRole('button', { name: /quick meet/i }));

    // Assert — error message rendered in document
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });
});
