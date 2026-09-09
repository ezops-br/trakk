import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock api-client before importing the hook.
// use-dashboard.ts does not exist yet — tests fail with "Cannot find module".
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

import { useDashboard } from '@/hooks/use-dashboard';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

// Minimal local interfaces for mock data — DashboardData types don't exist yet.
interface MockUserTicketSummary {
  id: string;
  number: number;
  title: string;
  priority: string;
  updatedAt: string;
  project: { key: string; name: string };
  statusColumn: { name: string };
}

interface MockActivitySummary {
  id: string;
  action: string;
  createdAt: string;
  user: { displayName: string };
  ticket: { number: number; projectId: string; project: { key: string } };
}

interface MockProjectSummary {
  id: string;
  name: string;
  key: string;
  role: string;
  openCount: number;
  totalCount: number;
}

const MOCK_TICKET: MockUserTicketSummary = {
  id: 'ticket-uuid-1',
  number: 1,
  title: 'Fix login bug',
  priority: 'HIGH',
  updatedAt: '2026-06-10T10:00:00Z',
  project: { key: 'TRAKK', name: 'Trakk' },
  statusColumn: { name: 'In Progress' },
};

const MOCK_ACTIVITY: MockActivitySummary = {
  id: 'activity-uuid-1',
  action: 'status_changed',
  createdAt: '2026-06-10T11:00:00Z',
  user: { displayName: 'Alice' },
  ticket: { number: 1, projectId: 'proj-uuid-1', project: { key: 'TRAKK' } },
};

const MOCK_PROJECT: MockProjectSummary = {
  id: 'proj-uuid-1',
  name: 'Trakk',
  key: 'TRAKK',
  role: 'OWNER',
  openCount: 3,
  totalCount: 10,
};

const MOCK_DASHBOARD_RESPONSE = {
  tickets: [MOCK_TICKET],
  activities: [MOCK_ACTIVITY],
  projects: [MOCK_PROJECT],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDashboard', () => {
  it('sets loading=true initially before fetch completes', () => {
    // Arrange — never-resolving promise to capture initial state
    mockGet.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useDashboard());

    // Assert
    expect(result.current.loading).toBe(true);
  });

  it('returns populated data after successful fetch', async () => {
    // Arrange
    mockGet.mockResolvedValue(MOCK_DASHBOARD_RESPONSE);

    // Act
    const { result } = renderHook(() => useDashboard());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickets).toHaveLength(1);
    expect(result.current.tickets[0].title).toBe('Fix login bug');
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].action).toBe('status_changed');
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].name).toBe('Trakk');
    expect(result.current.error).toBeNull();
  });

  it('sets error state when the fetch throws', async () => {
    // Arrange
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useDashboard());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.tickets).toEqual([]);
    expect(result.current.activities).toEqual([]);
    expect(result.current.projects).toEqual([]);
  });
});
