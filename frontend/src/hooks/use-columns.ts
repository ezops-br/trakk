'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { StatusColumn } from '@/lib/types';

export interface UseColumnsReturn {
  columns: StatusColumn[];
  loading: boolean;
  error: string | null;
  createColumn: (name: string) => Promise<StatusColumn>;
  updateColumn: (
    columnId: string,
    input: { name?: string; position?: number },
  ) => Promise<StatusColumn>;
  deleteColumn: (
    columnId: string,
    migrationTargetColumnId: string,
  ) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useColumns(projectId: string): UseColumnsReturn {
  const [columns, setColumns] = useState<StatusColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchColumns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { columns: data } = await apiClient.get<{ columns: StatusColumn[] }>(
        `/api/v1/projects/${projectId}/columns`,
      );
      setColumns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load columns');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  const createColumn = useCallback(
    async (name: string): Promise<StatusColumn> => {
      const { column } = await apiClient.post<{ column: StatusColumn }>(
        `/api/v1/projects/${projectId}/columns`,
        { name },
      );
      setColumns((prev) => [...prev, column]);
      return column;
    },
    [projectId],
  );

  const updateColumn = useCallback(
    async (
      columnId: string,
      input: { name?: string; position?: number },
    ): Promise<StatusColumn> => {
      const { column } = await apiClient.patch<{ column: StatusColumn }>(
        `/api/v1/projects/${projectId}/columns/${columnId}`,
        input,
      );
      setColumns((prev) =>
        prev
          .map((c) => (c.id === columnId ? column : c))
          .sort((a, b) => a.position - b.position),
      );
      return column;
    },
    [projectId],
  );

  const deleteColumn = useCallback(
    async (columnId: string, migrationTargetColumnId: string): Promise<void> => {
      await apiClient.del(
        `/api/v1/projects/${projectId}/columns/${columnId}`,
        { migrationTargetColumnId },
      );
      setColumns((prev) => prev.filter((c) => c.id !== columnId));
    },
    [projectId],
  );

  return {
    columns,
    loading,
    error,
    createColumn,
    updateColumn,
    deleteColumn,
    refetch: fetchColumns,
  };
}
