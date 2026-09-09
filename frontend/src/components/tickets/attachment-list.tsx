import * as React from "react";
import { Button } from "@/components/ui/button";
import type { TicketAttachment } from "@/lib/attachments";

// Note: `TicketAttachment.url` is an absolute URL — the backend builds it from
// the PUBLIC_BACKEND_URL env var (default http://localhost:4000) so the browser
// resolves it against the backend origin, not the frontend's. Safe to use
// directly in <img src={attachment.url}> without any host prefixing here.

export interface AttachmentListProps {
  attachments: TicketAttachment[];
  canDelete: (attachment: TicketAttachment) => boolean;
  onDelete: (attachmentId: string) => void;
}

/**
 * Detail-sheet attachments panel. The sheet decides *who* can delete
 * (OWNER / uploader rule) and supplies the callback. This component is
 * purely presentational so it stays easy to RTL-test.
 */
export function AttachmentList({
  attachments,
  canDelete,
  onDelete,
}: AttachmentListProps) {
  if (attachments.length === 0) {
    return (
      <p
        className="text-xs text-trakk-text-secondary"
        data-testid="attachment-list-empty"
      >
        No images attached yet.
      </p>
    );
  }

  return (
    <ul
      className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      data-testid="attachment-list"
    >
      {attachments.map((attachment) => {
        const deletable = canDelete(attachment);
        return (
          <li
            key={attachment.id}
            className="group relative aspect-square overflow-hidden rounded-lg border border-trakk-border bg-trakk-surface-alt"
            data-testid="attachment-list-item"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt={attachment.originalName}
              title={attachment.originalName}
              className="h-full w-full object-cover"
            />
            {deletable ? (
              <Button
                type="button"
                aria-label={`Delete ${attachment.originalName}`}
                variant="destructive"
                size="sm"
                onClick={() => onDelete(attachment.id)}
                className="absolute right-1 top-1 h-7 px-2 text-xs"
                data-testid="attachment-list-delete"
              >
                ✕
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}