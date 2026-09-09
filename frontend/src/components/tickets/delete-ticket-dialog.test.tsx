import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api-client';
import type { DeletionImpact } from './delete-ticket-dialog';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Stub lucide icons to keep the rendered DOM small and assertions stable.
vi.mock('lucide-react', async () => {
  const actual =
    await vi.importActual<typeof import('lucide-react')>('lucide-react');
  return {
    ...actual,
    AlertTriangle: (props: { className?: string }) =>
      React.createElement('span', {
        'data-testid': 'icon-alert-triangle',
        className: props.className,
      }),
    Loader2: (props: { className?: string }) =>
      React.createElement('span', {
        'data-testid': 'icon-loader',
        className: props.className,
      }),
  };
});

// Import after mocks so the component picks them up.
import { DeleteTicketDialog } from './delete-ticket-dialog';

const PROJECT_ID = 'proj-1';
const TICKET_NUMBER = 42;

const SAMPLE_IMPACT: DeletionImpact = {
  comments: 3,
  linkedAsSource: 1,
  linkedAsTarget: 2,
  activityLogEntries: 5,
  ticketLabels: 2,
};

describe('DeleteTicketDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(
    overrides: Partial<{
      onDeleted: () => void;
      onOpenChange: (open: boolean) => void;
      open: boolean;
      impact: DeletionImpact | null;
    }> = {},
  ) {
    const onDeleted = overrides.onDeleted ?? vi.fn();
    const onOpenChange = overrides.onOpenChange ?? vi.fn();
    const open = overrides.open ?? true;
    const impact = overrides.impact === undefined ? SAMPLE_IMPACT : overrides.impact;

    if (impact === null) {
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom'),
      );
    } else {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(impact);
    }

    (apiClient.del as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const utils = render(
      <DeleteTicketDialog
        open={open}
        onOpenChange={onOpenChange}
        projectId={PROJECT_ID}
        ticketNumber={TICKET_NUMBER}
        onDeleted={onDeleted}
      />,
    );

    return { ...utils, onDeleted, onOpenChange };
  }

  it('renders all non-zero counts as a bulleted list when open', async () => {
    renderDialog();

    // Wait for impact fetch to populate the list.
    await waitFor(() => {
      expect(screen.getByTestId('deletion-impact-list')).toBeInTheDocument();
    });

    // comments (3) → "3 comments"
    expect(screen.getByText('3 comments')).toBeInTheDocument();
    // linked (1 + 2 = 3) → "3 linked from/to"
    expect(screen.getByText('3 linked from/to')).toBeInTheDocument();
    // activityLogEntries (5) → "5 activity log entries"
    expect(screen.getByText('5 activity log entries')).toBeInTheDocument();

    expect(
      screen.getByText(/these will be permanently removed/i),
    ).toBeInTheDocument();
  });

  it('renders the empty-state copy when there are no comments, links, or activity entries', async () => {
    renderDialog({
      impact: {
        comments: 0,
        linkedAsSource: 0,
        linkedAsTarget: 0,
        activityLogEntries: 0,
        ticketLabels: 0,
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/this ticket will be permanently removed\./i),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/these will be permanently removed/i),
    ).not.toBeInTheDocument();
  });

  it('Cancel calls onOpenChange(false) and does NOT call DELETE', async () => {
    const { onOpenChange } = renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('deletion-impact-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiClient.del).not.toHaveBeenCalled();
  });

  it('Delete calls apiClient.del with the project/ticket path and invokes onDeleted on the happy path', async () => {
    const { onDeleted } = renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('deletion-impact-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('delete-ticket-confirm'));

    await waitFor(() => {
      expect(apiClient.del).toHaveBeenCalledWith(
        `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}`,
      );
    });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
