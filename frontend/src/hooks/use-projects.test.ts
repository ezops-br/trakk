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

import { useProjects } from '@/hooks/use-projects';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;
const mockDel = apiClient.del as ReturnType<typeof vi.fn>;

const MOCK_PROJECTS = [
  {
    id: 'proj-uuid-1',
    name: 'Trakk',
    key: 'TRAKK',
    description: null,
    role: 'OWNER',
    memberCount: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading=true, projects=[], error=null', () => {
    // Arrange — delay the response so we can inspect initial state
    mockGet.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useProjects());

    // Assert
    expect(result.current.loading).toBe(true);
    expect(result.current.projects).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets projects to API data and loading=false after successful fetch', async () => {
    // Arrange
    mockGet.mockResolvedValue({ projects: MOCK_PROJECTS });

    // Act
    const { result } = renderHook(() => useProjects());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual(MOCK_PROJECTS);
    expect(result.current.error).toBeNull();
  });

  it('sets error message and loading=false after a failed fetch', async () => {
    // Arrange
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useProjects());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('createProject success: appends to projects array and dispatches project-list-changed event', async () => {
    // Arrange
    mockGet.mockResolvedValue({ projects: MOCK_PROJECTS });
    const newProject = {
      id: 'proj-uuid-2',
      name: 'New Project',
      key: 'NEW',
      description: null,
      role: 'OWNER',
      memberCount: 1,
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    };
    mockPost.mockResolvedValue({ project: newProject });

    const dispatchedEvents: string[] = [];
    const listener = (e: Event) => dispatchedEvents.push(e.type);
    window.addEventListener('project-list-changed', listener);

    // Act
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createProject({ name: 'New Project', key: 'NEW', description: null });
    });

    // Assert
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.projects[1]).toMatchObject({ id: 'proj-uuid-2' });
    expect(dispatchedEvents).toContain('project-list-changed');

    window.removeEventListener('project-list-changed', listener);
  });

  it('deleteProject success: removes from projects array and dispatches project-list-changed event', async () => {
    // Arrange
    mockGet.mockResolvedValue({ projects: MOCK_PROJECTS });
    mockDel.mockResolvedValue(undefined);

    const dispatchedEvents: string[] = [];
    const listener = (e: Event) => dispatchedEvents.push(e.type);
    window.addEventListener('project-list-changed', listener);

    // Act
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteProject('proj-uuid-1');
    });

    // Assert
    expect(result.current.projects).toHaveLength(0);
    expect(dispatchedEvents).toContain('project-list-changed');

    window.removeEventListener('project-list-changed', listener);
  });

  it('updateProject success: updates the matching project in state', async () => {
    mockGet.mockResolvedValue({ projects: MOCK_PROJECTS });
    const updatedProject = {
      ...MOCK_PROJECTS[0],
      name: 'Trakk Updated',
    };
    mockPatch.mockResolvedValue({ project: updatedProject });

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateProject('proj-uuid-1', { name: 'Trakk Updated' });
    });

    expect(result.current.projects[0].name).toBe('Trakk Updated');
  });

  it('toggleArchive archive=true: removes project from active list and dispatches project-list-changed', async () => {
    mockGet.mockResolvedValue({ projects: MOCK_PROJECTS });
    const archivedProject = {
      ...MOCK_PROJECTS[0],
      archivedAt: '2024-06-10T00:00:00.000Z',
    };
    mockPatch.mockResolvedValue({ project: archivedProject });

    const dispatchedEvents: string[] = [];
    const listener = (e: Event) => dispatchedEvents.push(e.type);
    window.addEventListener('project-list-changed', listener);

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleArchive('proj-uuid-1', true);
    });

    expect(result.current.projects).toHaveLength(0);
    expect(dispatchedEvents).toContain('project-list-changed');
    window.removeEventListener('project-list-changed', listener);
  });
});
