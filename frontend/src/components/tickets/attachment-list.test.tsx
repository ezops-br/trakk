import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttachmentList } from './attachment-list';
import type { TicketAttachment } from '@/lib/attachments';

function makeAttachment(overrides: Partial<TicketAttachment> = {}): TicketAttachment {
  return {
    id: 'att-1',
    ticketId: 'tkt-1',
    uploaderId: 'user-1',
    uploaderDisplayName: 'Alice',
    url: '/api/v1/projects/proj-1/tickets/7/attachments/att-1/raw',
    mimeType: 'image/png',
    sizeBytes: 1024,
    originalName: 'screenshot.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AttachmentList', () => {
  it('renders the empty-state copy when there are no attachments', () => {
    render(
      <AttachmentList attachments={[]} canDelete={() => true} onDelete={() => undefined} />,
    );
    expect(screen.getByTestId('attachment-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No images attached yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-list')).toBeNull();
  });

  it('renders one thumbnail per attachment', () => {
    const attachments = [
      makeAttachment({ id: 'a-1', url: '/api/v1/projects/proj-1/tickets/7/attachments/a-1/raw', originalName: 'one.png' }),
      makeAttachment({ id: 'a-2', url: '/api/v1/projects/proj-1/tickets/7/attachments/a-2/raw', originalName: 'two.png' }),
    ];
    render(
      <AttachmentList attachments={attachments} canDelete={() => false} onDelete={() => undefined} />,
    );

    const items = screen.getAllByTestId('attachment-list-item');
    expect(items).toHaveLength(2);

    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([
      '/api/v1/projects/proj-1/tickets/7/attachments/a-1/raw',
      '/api/v1/projects/proj-1/tickets/7/attachments/a-2/raw',
    ]);
  });

  it('hides the delete button when canDelete returns false', () => {
    const a = makeAttachment();
    render(
      <AttachmentList attachments={[a]} canDelete={() => false} onDelete={() => undefined} />,
    );
    expect(screen.queryByTestId('attachment-list-delete')).toBeNull();
  });

  it('shows the delete button when canDelete returns true', () => {
    const a = makeAttachment();
    render(
      <AttachmentList attachments={[a]} canDelete={() => true} onDelete={() => undefined} />,
    );
    expect(screen.getByTestId('attachment-list-delete')).toBeInTheDocument();
    expect(screen.getByTestId('attachment-list-delete')).toHaveAttribute(
      'aria-label',
      'Delete screenshot.png',
    );
  });

  it('calls onDelete with the attachment id when the visible delete button is clicked', () => {
    const a = makeAttachment({ id: 'click-me' });
    const onDelete = vi.fn();
    render(
      <AttachmentList attachments={[a]} canDelete={() => true} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByTestId('attachment-list-delete'));

    expect(onDelete).toHaveBeenCalledWith('click-me');
  });

  it('passes the per-attachment object to the canDelete predicate', () => {
    const a1 = makeAttachment({ id: 'a-1', uploaderId: 'user-1' });
    const a2 = makeAttachment({ id: 'a-2', uploaderId: 'user-2' });
    const canDelete = vi.fn((att: TicketAttachment) => att.uploaderId === 'user-1');

    render(
      <AttachmentList attachments={[a1, a2]} canDelete={canDelete} onDelete={() => undefined} />,
    );

    expect(canDelete).toHaveBeenCalledWith(a1);
    expect(canDelete).toHaveBeenCalledWith(a2);

    // Only the user-1 attachment should expose the delete button.
    expect(screen.getAllByTestId('attachment-list-delete')).toHaveLength(1);
  });
});