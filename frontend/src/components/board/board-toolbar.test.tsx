import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardToolbar } from '@/components/board/board-toolbar';
import type { BoardFilters, MemberWithUser, Label } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';

const EMPTY_FILTERS: BoardFilters = {
  assigneeIds: [],
  priorities: [],
  labelIds: [],
  search: '',
};

const MOCK_MEMBERS: MemberWithUser[] = [
  {
    id: 'member-1',
    projectId: 'proj-1',
    userId: 'user-1',
    role: 'OWNER',
    joinedAt: '2024-01-01T00:00:00.000Z',
    user: { id: 'user-1', displayName: 'Alice Smith', avatarUrl: null, email: 'alice@example.com' },
  },
  {
    id: 'member-2',
    projectId: 'proj-1',
    userId: 'user-2',
    role: 'MEMBER',
    joinedAt: '2024-01-01T00:00:00.000Z',
    user: { id: 'user-2', displayName: 'Bob Jones', avatarUrl: null, email: 'bob@example.com' },
  },
];

const MOCK_LABELS: Label[] = [
  { id: 'label-1', projectId: 'proj-1', name: 'Bug', color: '#ff0000' },
  { id: 'label-2', projectId: 'proj-1', name: 'Feature', color: '#00ff00' },
];

const DEFAULT_PROPS = {
  projectId: 'proj-1',
  filters: EMPTY_FILTERS,
  members: MOCK_MEMBERS,
  labels: MOCK_LABELS,
  onAssigneeChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onLabelChange: vi.fn(),
  onSearchChange: vi.fn(),
  onClearAll: vi.fn(),
  isLoadingFilterData: false,
};

describe('BoardToolbar', () => {
  it('renders a search input', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} />);

    // Assert
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('calls onSearchChange when the search input value changes', () => {
    // Arrange
    const onSearchChange = vi.fn();
    render(<BoardToolbar {...DEFAULT_PROPS} onSearchChange={onSearchChange} />);

    // Act
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'login bug' } });

    // Assert
    expect(onSearchChange).toHaveBeenCalledWith('login bug');
  });

  it('does not render active filter badges when filters are empty', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} filters={EMPTY_FILTERS} />);

    // Assert — no "Clear all" link visible
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument();
  });

  it('renders a badge with X for an active assignee filter and calls onAssigneeChange on X click', () => {
    // Arrange — user-1 is in the assignee filter
    const onAssigneeChange = vi.fn();
    const filtersWithAssignee: BoardFilters = { ...EMPTY_FILTERS, assigneeIds: ['user-1'] };
    render(
      <BoardToolbar
        {...DEFAULT_PROPS}
        filters={filtersWithAssignee}
        onAssigneeChange={onAssigneeChange}
      />,
    );

    // Assert — Alice Smith badge is rendered
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();

    // Act — click the X on the badge
    const removeBtn = screen.getByRole('button', { name: /remove alice smith/i });
    fireEvent.click(removeBtn);

    // Assert
    expect(onAssigneeChange).toHaveBeenCalledWith([]);
  });

  it('shows "Clear all" control when hasActiveFilters is true and calls onClearAll', () => {
    // Arrange
    const onClearAll = vi.fn();
    const activeFilters: BoardFilters = { ...EMPTY_FILTERS, priorities: ['HIGH'] };
    render(
      <BoardToolbar {...DEFAULT_PROPS} filters={activeFilters} onClearAll={onClearAll} />,
    );

    // Act — find and click the Clear all control
    const clearAll = screen.getByText(/clear all/i);
    fireEvent.click(clearAll);

    // Assert
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('does not render a badge for a stale assigneeId that has no matching member', () => {
    // Arrange — UUID is in filters but not in members list
    const filtersWithStale: BoardFilters = {
      ...EMPTY_FILTERS,
      assigneeIds: ['stale-uuid-not-in-members'],
    };
    render(<BoardToolbar {...DEFAULT_PROPS} filters={filtersWithStale} />);

    // Assert — no badge text for a stale UUID
    expect(screen.queryByText('stale-uuid-not-in-members')).not.toBeInTheDocument();
  });

  it('disables assignee popover trigger when isLoadingFilterData is true', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} isLoadingFilterData={true} />);

    // Assert — assignee button should be disabled
    const assigneeBtn = screen.getByRole('button', { name: /assignee/i });
    expect(assigneeBtn).toBeDisabled();
  });
});
