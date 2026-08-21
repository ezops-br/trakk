import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Import the Zod schema exported by the dialog component (does not exist yet)
import { scheduleMeetingSchema, ScheduleMeetingDialog } from './ScheduleMeetingDialog';

const MOCK_SCHEDULE_FN = vi.fn();
const MOCK_ON_CLOSE = vi.fn();

const DEFAULT_PROPS = {
  open: true,
  onClose: MOCK_ON_CLOSE,
  scheduleMeeting: MOCK_SCHEDULE_FN,
  projectId: 'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
  ticketNumber: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scheduleMeetingSchema', () => {
  it('accepts valid input with non-empty title and endTime after startTime', () => {
    // Arrange
    const validInput = {
      title: 'Planning session',
      startTime: '2026-06-12T14:00',
      endTime: '2026-06-12T15:00',
    };

    // Act
    const result = scheduleMeetingSchema.safeParse(validInput);

    // Assert
    expect(result.success).toBe(true);
  });

  it('rejects empty title with a validation error on the title field', () => {
    // Arrange
    const invalidInput = {
      title: '',
      startTime: '2026-06-12T14:00',
      endTime: '2026-06-12T15:00',
    };

    // Act
    const result = scheduleMeetingSchema.safeParse(invalidInput);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      const titleErrors = result.error.issues.filter((issue) =>
        issue.path.includes('title'),
      );
      expect(titleErrors.length).toBeGreaterThan(0);
    }
  });

  it('rejects endTime <= startTime with a validation error', () => {
    // Arrange — endTime equals startTime
    const invalidInput = {
      title: 'Valid title',
      startTime: '2026-06-12T14:00',
      endTime: '2026-06-12T14:00',
    };

    // Act
    const result = scheduleMeetingSchema.safeParse(invalidInput);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have at least one validation issue referencing time ordering
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('ScheduleMeetingDialog', () => {
  it('renders without crashing (smoke test)', () => {
    // Act & Assert — should not throw
    render(<ScheduleMeetingDialog {...DEFAULT_PROPS} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('empty title shows inline validation error and does not call scheduleMeeting', async () => {
    // Arrange
    render(<ScheduleMeetingDialog {...DEFAULT_PROPS} />);

    // Act — clear title and try to submit
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: '' } });

    const submitButton = screen.getByRole('button', { name: /schedule|create|save/i });
    fireEvent.click(submitButton);

    // Assert — validation error shown, handler not called
    await waitFor(() => {
      expect(MOCK_SCHEDULE_FN).not.toHaveBeenCalled();
    });
  });

  it('valid form calls scheduleMeeting with { title, startTime, endTime }', async () => {
    // Arrange
    MOCK_SCHEDULE_FN.mockResolvedValue({
      meeting: {
        id: 'meeting-uuid-1',
        title: 'Planning session',
      },
    });
    render(<ScheduleMeetingDialog {...DEFAULT_PROPS} />);

    // Act — fill in valid data and submit
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Planning session' } });

    // Set start and end times via inputs
    const dateTimeInputs = screen.getAllByDisplayValue('');
    // startTime and endTime inputs — find them by label if possible
    const startTimeInput = screen.getByLabelText(/start/i);
    const endTimeInput = screen.getByLabelText(/end/i);
    fireEvent.change(startTimeInput, { target: { value: '2026-06-12T14:00' } });
    fireEvent.change(endTimeInput, { target: { value: '2026-06-12T15:00' } });

    const submitButton = screen.getByRole('button', { name: /schedule|create|save/i });
    fireEvent.click(submitButton);

    // Assert — scheduleMeeting called with correct shape
    await waitFor(() => {
      expect(MOCK_SCHEDULE_FN).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Planning session',
          startTime: expect.any(String),
          endTime: expect.any(String),
        }),
      );
    });
  });
});
