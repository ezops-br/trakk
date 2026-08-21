import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock api-client before importing the hook
vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { useColumns } from '@/hooks/use-columns';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'proj-uuid-1';

const MOCK_COLUMN = {
  id: 'col-1',
  projectId: PROJECT_ID,
  name: 'To Do',
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_COLUMN_2 = { ...MOCK_COLUMN, id: 'col-2', name: 'In Review', position: 1 };

describe('useColumns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches on mount and unwraps the { columns } envelope into state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ columns: [MOCK_COLUMN] });

    // Act
    const { result } = renderHook(() => useColumns(PROJECT_ID));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.columns).toHaveLength(1);
    expect(result.current.columns[0]).toMatchObject({ id: 'col-1', name: 'To Do' });
    expect(mockGet).toHaveBeenCalledWith(`/api/v1/projects/${PROJECT_ID}/columns`);
  });

  it('createColumn appends the new column to state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ columns: [MOCK_COLUMN] });
    mockPost.mockResolvedValue({ column: MOCK_COLUMN_2 });

    // Act
    const { result } = renderHook(() => useColumns(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createColumn('In Review');
    });

    // Assert
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/columns`,
      { name: 'In Review' },
    );
    expect(result.current.columns).toHaveLength(2);
    expect(result.current.columns[1]).toMatchObject({ id: 'col-2' });
  });
});
