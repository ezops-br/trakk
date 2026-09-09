'use client';

import * as React from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { LabelSummary } from '@/lib/types';

export type AddTicketLabelFn = (
  ticketNumber: number,
  labelId: string,
) => Promise<void>;

export interface UseAddTicketLabelReturn {
  addLabel: AddTicketLabelFn;
}

function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function useAddTicketLabel(
  projectId: string,
): UseAddTicketLabelReturn {
  const addLabel = React.useCallback<AddTicketLabelFn>(
    async (ticketNumber, labelId) => {
      const { ticket: updated } = await apiClient.post<{
        ticket: { id: string; labels: LabelSummary[] };
      }>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/labels`,
        { labelId },
      );
      // The caller (create-ticket-dialog) is responsible for handling the
      // response — this hook only forwards the network call. We intentionally
      // do not keep local state here.
      void updated;
    },
    [projectId],
  );

  return { addLabel };
}

export { isApiError };
