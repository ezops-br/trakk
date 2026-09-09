'use client';

import * as React from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type {
  CreateTicketTemplateInput,
  TicketTemplate,
  UpdateTicketTemplateInput,
} from '@/lib/types';

export interface UseTemplatesReturn {
  templates: TicketTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createTemplate: (input: CreateTicketTemplateInput) => Promise<TicketTemplate>;
  updateTemplate: (
    templateId: string,
    input: UpdateTicketTemplateInput,
  ) => Promise<TicketTemplate>;
  deleteTemplate: (templateId: string) => Promise<void>;
}

function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function useTemplates(projectId: string): UseTemplatesReturn {
  const [templates, setTemplates] = React.useState<TicketTemplate[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<{ templates: TicketTemplate[] }>(
        `/api/v1/projects/${projectId}/templates`,
      );
      setTemplates(data.templates);
    } catch (err) {
      const message =
        isApiError(err) && err.status === 403
          ? 'Only owners can manage templates'
          : err instanceof Error
            ? err.message
            : 'Failed to load templates';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  const createTemplate = React.useCallback(
    async (input: CreateTicketTemplateInput): Promise<TicketTemplate> => {
      const data = await apiClient.post<{ template: TicketTemplate }>(
        `/api/v1/projects/${projectId}/templates`,
        input,
      );
      setTemplates((prev) => [...prev, data.template]);
      return data.template;
    },
    [projectId],
  );

  const updateTemplate = React.useCallback(
    async (
      templateId: string,
      input: UpdateTicketTemplateInput,
    ): Promise<TicketTemplate> => {
      const data = await apiClient.patch<{ template: TicketTemplate }>(
        `/api/v1/projects/${projectId}/templates/${templateId}`,
        input,
      );
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? data.template : t)),
      );
      return data.template;
    },
    [projectId],
  );

  const deleteTemplate = React.useCallback(
    async (templateId: string): Promise<void> => {
      await apiClient.del(
        `/api/v1/projects/${projectId}/templates/${templateId}`,
      );
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    },
    [projectId],
  );

  return {
    templates,
    loading,
    error,
    refetch,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}