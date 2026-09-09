import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTemplates } from './use-templates';
import { ApiError, apiClient } from '@/lib/api-client';
import type { TicketTemplate } from '@/lib/types';

vi.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    details: string | undefined;
    constructor(status: number, message: string, details?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const PROJECT_ID = 'proj-1';

const SAMPLE_TEMPLATES: TicketTemplate[] = [
  {
    id: 'tpl-1',
    projectId: PROJECT_ID,
    name: 'Bug fix',
    titleTemplate: '[Bug] {{summary}}',
    descriptionTemplate: 'Steps to reproduce…',
    defaultPriority: 'HIGH',
    defaultLabels: [{ id: 'lbl-1', name: 'Bug', color: '#ff0000' }],
    createdAt: '2026-07-27T10:00:00Z',
    updatedAt: '2026-07-27T10:00:00Z',
  },
  {
    id: 'tpl-2',
    projectId: PROJECT_ID,
    name: 'Feature',
    titleTemplate: null,
    descriptionTemplate: null,
    defaultPriority: null,
    defaultLabels: [],
    createdAt: '2026-07-27T11:00:00Z',
    updatedAt: '2026-07-27T11:00:00Z',
  },
];

const SAMPLE_NEW_TEMPLATE: TicketTemplate = {
  id: 'tpl-3',
  projectId: PROJECT_ID,
  name: 'Documentation',
  titleTemplate: null,
  descriptionTemplate: null,
  defaultPriority: 'LOW',
  defaultLabels: [],
  createdAt: '2026-07-27T12:00:00Z',
  updatedAt: '2026-07-27T12:00:00Z',
};

describe('useTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('initial fetch returns templates mapped to the hook return value', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      templates: SAMPLE_TEMPLATES,
    });

    const { result } = renderHook(() => useTemplates(PROJECT_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/templates`,
    );
    expect(result.current.templates).toEqual(SAMPLE_TEMPLATES);
    expect(result.current.error).toBeNull();
  });

  it('createTemplate posts the body to the templates endpoint, returns the new template and appends it to state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      templates: SAMPLE_TEMPLATES,
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      template: SAMPLE_NEW_TEMPLATE,
    });

    const { result } = renderHook(() => useTemplates(PROJECT_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let created: TicketTemplate | undefined;
    await act(async () => {
      created = await result.current.createTemplate({
        name: 'Documentation',
        defaultPriority: 'LOW',
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/templates`,
      {
        name: 'Documentation',
        defaultPriority: 'LOW',
      },
    );
    expect(created).toEqual(SAMPLE_NEW_TEMPLATE);
    expect(result.current.templates).toContain(SAMPLE_NEW_TEMPLATE);
  });

  it('deleteTemplate sends DELETE with the right URL and removes the template from state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      templates: SAMPLE_TEMPLATES,
    });
    vi.mocked(apiClient.del).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTemplates(PROJECT_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteTemplate('tpl-1');
    });

    expect(apiClient.del).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/templates/tpl-1`,
    );
    expect(
      result.current.templates.find((t) => t.id === 'tpl-1'),
    ).toBeUndefined();
  });

  it('surfaces 409 from the server as a typed ApiError on createTemplate (not as an unhandled rejection)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      templates: SAMPLE_TEMPLATES,
    });
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new ApiError(409, 'A template with this name already exists'),
    );

    const { result } = renderHook(() => useTemplates(PROJECT_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await expect(
        result.current.createTemplate({ name: 'Duplicate' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 409,
        message: 'A template with this name already exists',
      });
    });
  });
});