import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
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

/**
 * Radix DropdownMenu listens to a full pointerdown -> pointerup -> click
 * sequence on its trigger before opening the menu (which then renders into a
 * portal). Synthesize that and flush React effects so the menu items appear.
 */
function openDropdown(trigger: HTMLElement) {
  act(() => {
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' });
    fireEvent.click(trigger);
  });
}

const DEFAULT_PROPS = {
  projectId: 'proj-1',
  filters: EMPTY_FILTERS,
  members: MOCK_MEMBERS,
  labels: MOCK_LABELS,
  onAssigneeChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onLabelChange: vi.fn(),
  onSearchChange: vi.fn(),
  onDueDateChange: vi.fn(),
  onSortChange: vi.fn(),
  onOrderChange: vi.fn(),
  sort: 'sortOrder' as const,
  order: 'asc' as const,
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

  it('renders the Sort dropdown trigger', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} />);

    // Assert
    expect(screen.getByRole('button', { name: /sort/i })).toBeInTheDocument();
  });

  it('shows all 7 sort options by label when the dropdown is open', () => {
    // Arrange
    render(<BoardToolbar {...DEFAULT_PROPS} />);

    // Act — open the dropdown via the trigger
    const trigger = screen.getByTestId('board-toolbar-sort-trigger');
    openDropdown(trigger);

    // Assert — all 7 sort options are present (rendered into a Radix portal)
    waitFor(() => {
      expect(screen.getByText('Manual order')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Due date')).toBeInTheDocument();
      expect(screen.getByText('Created date')).toBeInTheDocument();
      expect(screen.getByText('Updated date')).toBeInTheDocument();
      expect(screen.getByText('Ticket number')).toBeInTheDocument();
      expect(screen.getByText('Assignee')).toBeInTheDocument();
    });
  });

  it('calls onSortChange("priority") when the Priority option is clicked', () => {
    // Arrange
    const onSortChange = vi.fn();
    render(<BoardToolbar {...DEFAULT_PROPS} onSortChange={onSortChange} />);

    // Act — open the dropdown, then click Priority
    const trigger = screen.getByTestId('board-toolbar-sort-trigger');
    openDropdown(trigger);

    waitFor(() => {
      const priorityOption = screen.getByText('Priority');
      fireEvent.click(priorityOption);
    });

    // Assert
    waitFor(() => {
      expect(onSortChange).toHaveBeenCalledWith('priority');
    });
  });

  it('shows "asc" by default on the order toggle', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} />);

    // Assert
    expect(screen.getByTestId('board-toolbar-order-toggle')).toHaveTextContent('asc');
  });

  it('shows "desc" on the order toggle when order="desc"', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} order="desc" />);

    // Assert
    expect(screen.getByTestId('board-toolbar-order-toggle')).toHaveTextContent('desc');
  });

  it('calls onOrderChange("desc") when order is "asc" and toggle is clicked', () => {
    // Arrange — toggle is disabled when sort is the default "sortOrder",
    // so use a named sort to make the toggle clickable.
    const onOrderChange = vi.fn();
    render(
      <BoardToolbar
        {...DEFAULT_PROPS}
        sort="priority"
        onOrderChange={onOrderChange}
      />,
    );

    // Act
    const toggle = screen.getByTestId('board-toolbar-order-toggle');
    fireEvent.click(toggle);

    // Assert
    expect(onOrderChange).toHaveBeenCalledWith('desc');
  });

  // --- Due date control --------------------------------------------------

  it('renders an inactive Due date trigger when no due-date filter is set', () => {
    // Arrange + Act
    render(<BoardToolbar {...DEFAULT_PROPS} />);

    // Assert — trigger exists, no enum suffix, no badge
    const trigger = screen.getByTestId('board-toolbar-due-date-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Due date');
    expect(screen.queryByText(/^Due: Overdue$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Due: Due today$/)).not.toBeInTheDocument();
  });

  it('renders "Overdue" trigger label and badge when dueDateFilter is "overdue"', () => {
    // Arrange
    const filtersWithOverdue: BoardFilters = { ...EMPTY_FILTERS, dueDateFilter: 'overdue' };
    render(<BoardToolbar {...DEFAULT_PROPS} filters={filtersWithOverdue} />);

    // Assert — trigger text and badge both reflect "Overdue"
    expect(screen.getByTestId('board-toolbar-due-date-trigger')).toHaveTextContent('Due date: Overdue');
    expect(screen.getByText(/^Due: Overdue$/)).toBeInTheDocument();
  });

  it('calls onDueDateChange() (no args) when the Due date badge remove button is clicked', () => {
    // Arrange
    const onDueDateChange = vi.fn();
    const filtersWithOverdue: BoardFilters = { ...EMPTY_FILTERS, dueDateFilter: 'overdue' };
    render(
      <BoardToolbar
        {...DEFAULT_PROPS}
        filters={filtersWithOverdue}
        onDueDateChange={onDueDateChange}
      />,
    );

    // Act
    const removeBtn = screen.getByRole('button', { name: /remove due-date filter overdue/i });
    fireEvent.click(removeBtn);

    // Assert — single call with no arguments = clear
    expect(onDueDateChange).toHaveBeenCalledOnce();
    expect(onDueDateChange.mock.calls[0]).toEqual([]);
  });

  it('calls onDueDateChange(undefined, from, to) when Custom range Apply is clicked', async () => {
    // Arrange
    const onDueDateChange = vi.fn();
    render(<BoardToolbar {...DEFAULT_PROPS} onDueDateChange={onDueDateChange} />);

    // Act — open the popover, fill both fields, click Apply
    const trigger = screen.getByTestId('board-toolbar-due-date-trigger');
    fireEvent.click(trigger);

    const fromInput = await screen.findByTestId('due-date-from');
    const toInput = await screen.findByTestId('due-date-to');
    fireEvent.change(fromInput, { target: { value: '2026-07-20' } });
    fireEvent.change(toInput, { target: { value: '2026-07-25' } });

    const applyBtn = screen.getByTestId('due-date-apply');
    fireEvent.click(applyBtn);

    // Assert — single call: (undefined, '2026-07-20', '2026-07-25')
    expect(onDueDateChange).toHaveBeenCalledOnce();
    expect(onDueDateChange.mock.calls[0][0]).toBeUndefined();
    expect(onDueDateChange.mock.calls[0][1]).toBe('2026-07-20');
    expect(onDueDateChange.mock.calls[0][2]).toBe('2026-07-25');
  });
});
