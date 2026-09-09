// Hook for ticket attachments: list + upload + delete.
//
// Mirrors the structure of `frontend/src/hooks/use-comments.ts` and
// `frontend/src/hooks/use-links.ts`:
//   - Uses raw `useState` / `useEffect` / `useCallback` (the project does not
//     depend on `@tanstack/react-query` — there are no query keys to invalidate).
//   - After a successful upload/delete, refetches its own list, matching the
//     fetch-then-invalidate parity that `use-comments.createComment` already
//     uses. The caller (the detail sheet) is responsible for refetching
//     ticket-level and board-level data, exactly as it does today for comments
//     and links via `useTicketDetail.refetch` and `useTickets.refetch`.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AttachmentFileTooLargeError,
  type TicketAttachment,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
} from "@/lib/attachments";

interface UseAttachmentsResult {
  attachments: TicketAttachment[];
  loading: boolean;
  error: string | null;
  /** Re-fetch the attachment list for the current ticket. */
  refetch: () => Promise<void>;
  /**
   * Upload a single file as an attachment. Resolves with the created
   * attachment and refetches the list. Rejects with
   * `AttachmentFileTooLargeError` if `file.size > 8 MB` before any network call.
   */
  upload: (file: File) => Promise<TicketAttachment>;
  /**
   * Delete an attachment by id. Resolves once the server has removed the row
   * and refetches the list.
   */
  remove: (attachmentId: string) => Promise<void>;
}

/**
 * Manages the attachment list for a single ticket.
 *
 * @param projectId       Owning project id (path segment).
 * @param ticketNumber    Ticket number within the project (path segment).
 * @param enabled         When `false`, the initial fetch is skipped. The
 *                        hook still returns the same shape so the caller can
 *                        destructure unconditionally.
 */
export function useAttachments(
  projectId: string,
  ticketNumber: number,
  enabled: boolean = true,
): UseAttachmentsResult {
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  // Guards against late fetches landing after the component unmounts or
  // after the user navigates to a different ticket.
  const cancelledRef = useRef<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const items = await listAttachments(projectId, ticketNumber);
      if (!cancelledRef.current) {
        setAttachments(items);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load attachments");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [projectId, ticketNumber]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load, enabled]);

  const upload = useCallback(
    async (file: File): Promise<TicketAttachment> => {
      // Pre-flight size check: surfaces the error before the network round-trip.
      if (file.size > 8 * 1024 * 1024) {
        throw new AttachmentFileTooLargeError(file.size);
      }
      const created = await uploadAttachment(projectId, ticketNumber, file);
      // Mirror use-comments.createComment: refresh the list so the UI sees the
      // server-authoritative ordering and any peer-driven changes that landed
      // during the upload.
      await load();
      return created;
    },
    [projectId, ticketNumber, load],
  );

  const remove = useCallback(
    async (attachmentId: string): Promise<void> => {
      await deleteAttachment(projectId, ticketNumber, attachmentId);
      await load();
    },
    [projectId, ticketNumber, load],
  );

  return {
    attachments,
    loading,
    error,
    refetch: load,
    upload,
    remove,
  };
}