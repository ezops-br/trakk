// Typed client for ticket attachments.
//
// Mirrors the per-feature client/hook split used elsewhere in this frontend
// (see `frontend/src/lib/api-client.ts` and `frontend/src/hooks/use-comments.ts`).
// The attachment routes accept multipart/form-data for uploads, so the upload
// helper uses raw `fetch` directly — `apiClient.post` in `api-client.ts` is
// JSON-only and would mangle `FormData` with a hard-coded `Content-Type`.
//
// Field/schema definitions live here (not in `lib/types.ts`) because the
// `TicketAttachment` shape is local to this surface; the next subcard will
// add `TicketWithRelations.attachments?: TicketAttachment[]` in `types.ts`
// once the UI surface lands.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Mirrors the DTO returned by `backend/src/services/ticket-attachment.service.ts:TicketAttachmentDto`.
 * Kept in lockstep with the server: any new field added server-side must be
 * added here so the type doesn't silently lose data.
 */
export interface TicketAttachment {
  id: string;
  ticketId: string;
  uploaderId: string;
  uploaderDisplayName: string;
  url: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  /** ISO timestamp string — deserialized from JSON. */
  createdAt: string;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Reason for aborting before the network round-trip. Surfaced verbatim by
 * callers (they wrap it in `toast.error(...)` in the UI layer).
 */
export class AttachmentFileTooLargeError extends Error {
  readonly sizeBytes: number;
  readonly limitBytes: number;

  constructor(sizeBytes: number, limitBytes: number = MAX_FILE_BYTES) {
    super(`Image must be ${limitBytes / (1024 * 1024)} MB or smaller`);
    this.name = "AttachmentFileTooLargeError";
    this.sizeBytes = sizeBytes;
    this.limitBytes = limitBytes;
  }
}

/**
 * GET /api/v1/projects/:projectId/tickets/:ticketNumber/attachments
 *
 * Returns the flat list of attachments for a ticket (callers don't need the
 * `{ attachments }` envelope exposed here).
 */
export async function listAttachments(
  projectId: string,
  ticketNumber: number,
): Promise<TicketAttachment[]> {
  const response = await fetch(
    `${BASE_URL}/api/v1/projects/${projectId}/tickets/${ticketNumber}/attachments`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw await toApiError(response);
  }

  const body = (await response.json()) as { attachments: TicketAttachment[] };
  return body.attachments;
}

/**
 * POST /api/v1/projects/:projectId/tickets/:ticketNumber/attachments
 *
 * Sends the file as multipart/form-data with the field name `file`, matching
 * the backend's `multer({ ... }).single('file')` configuration. Browser sets
 * the multipart boundary automatically — we do NOT set `Content-Type` manually.
 *
 * Throws `AttachmentFileTooLargeError` before the network call if the file
 * exceeds the 8 MB cap (the backend enforces the same limit; this is a UX
 * nicety so the user sees a clear error before the upload is attempted).
 */
export async function uploadAttachment(
  projectId: string,
  ticketNumber: number,
  file: File,
): Promise<TicketAttachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new AttachmentFileTooLargeError(file.size);
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${BASE_URL}/api/v1/projects/${projectId}/tickets/${ticketNumber}/attachments`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  );

  if (!response.ok) {
    throw await toApiError(response);
  }

  const body = (await response.json()) as { attachment: TicketAttachment };
  return body.attachment;
}

/**
 * DELETE /api/v1/projects/:projectId/tickets/:ticketNumber/attachments/:attachmentId
 *
 * Resolves on 2xx (backend returns 200 with `{ message }`). No body required.
 */
export async function deleteAttachment(
  projectId: string,
  ticketNumber: number,
  attachmentId: string,
): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/api/v1/projects/${projectId}/tickets/${ticketNumber}/attachments/${attachmentId}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw await toApiError(response);
  }
}

/**
 * Mirrors the same non-2xx error handling used by `api-client.ts`: try the
 * server's `{ code, message }` shape, fall back to statusText, throw an Error
 * carrying the message for the caller to surface.
 */
async function toApiError(response: Response): Promise<Error> {
  let message = response.statusText || `Request failed with status ${response.status}`;
  try {
    const body = (await response.clone().json()) as { message?: string; code?: string };
    if (body?.message) {
      message = body.message;
    }
  } catch {
    // Body wasn't JSON — keep the statusText fallback.
  }
  return new Error(message);
}
