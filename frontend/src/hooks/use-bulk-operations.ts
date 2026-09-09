'use client';

import React, { useCallback, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  BulkUpdatePayload,
  BulkUpdateResult,
  BulkDeleteResult,
} from '@/lib/types';

export interface UseBulkOperationsResult {
  bulkUpdate: (
    payload: BulkUpdatePayload,
  ) => Promise<BulkUpdateResult | BulkDeleteResult>;
  loading: boolean;
  error: string | null;
}

export function useBulkOperations(
  projectId: string,
): UseBulkOperationsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bulkUpdate = useCallback(
    async (payload: BulkUpdatePayload) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.patch<
          BulkUpdateResult | BulkDeleteResult
        >(
          `/api/v1/projects/${projectId}/tickets/bulk`,
          payload,
        );
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Bulk update failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  return React.useMemo<UseBulkOperationsResult>(
    () => ({ bulkUpdate, loading, error }),
    [bulkUpdate, loading, error],
  );
}