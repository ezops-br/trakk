'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { LabelSummary } from '@/lib/types';

export interface UseLabelsReturn {
  labels: LabelSummary[];
  loading: boolean;
  error: string | null;
  createLabel: (name: string, color: string) => Promise<LabelSummary>;
  updateLabel: (
    labelId: string,
    input: { name?: string; color?: string },
  ) => Promise<LabelSummary>;
  deleteLabel: (labelId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useLabels(projectId: string): UseLabelsReturn {
  const [labels, setLabels] = useState<LabelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { labels: data } = await apiClient.get<{ labels: LabelSummary[] }>(
        `/api/v1/projects/${projectId}/labels`,
      );
      setLabels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load labels');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const createLabel = useCallback(
    async (name: string, color: string): Promise<LabelSummary> => {
      const { label } = await apiClient.post<{ label: LabelSummary }>(
        `/api/v1/projects/${projectId}/labels`,
        { name, color },
      );
      setLabels((prev) =>
        [...prev, label].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return label;
    },
    [projectId],
  );

  const updateLabel = useCallback(
    async (
      labelId: string,
      input: { name?: string; color?: string },
    ): Promise<LabelSummary> => {
      const { label } = await apiClient.patch<{ label: LabelSummary }>(
        `/api/v1/projects/${projectId}/labels/${labelId}`,
        input,
      );
      setLabels((prev) =>
        prev
          .map((l) => (l.id === labelId ? label : l))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      return label;
    },
    [projectId],
  );

  const deleteLabel = useCallback(
    async (labelId: string): Promise<void> => {
      await apiClient.del(`/api/v1/projects/${projectId}/labels/${labelId}`);
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
    },
    [projectId],
  );

  return {
    labels,
    loading,
    error,
    createLabel,
    updateLabel,
    deleteLabel,
    refetch: fetchLabels,
  };
}
