import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AttachmentFileTooLargeError,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
  type TicketAttachment,
} from "@/lib/attachments";

const SAMPLE_ATTACHMENT: TicketAttachment = {
  id: "att-1",
  ticketId: "ticket-1",
  uploaderId: "user-1",
  uploaderDisplayName: "Alice",
  url: "/api/v1/projects/proj-1/tickets/7/attachments/att-1/raw",
  mimeType: "image/png",
  originalName: "screenshot.png",
  sizeBytes: 1024,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(init: { status?: number; statusText?: string } = {}): Response {
  return new Response(null, {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
  });
}

describe("lib/attachments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listAttachments", () => {
    it("GETs the attachments endpoint and unwraps the { attachments } envelope", async () => {
      // Arrange
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          jsonResponse({ attachments: [SAMPLE_ATTACHMENT, { ...SAMPLE_ATTACHMENT, id: "att-2" }] }),
        );

      // Act
      const result = await listAttachments("proj-1", 7);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("att-1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const called = fetchMock.mock.calls[0];
      expect(called[0]).toBe("/api/v1/projects/proj-1/tickets/7/attachments");
      const requestInit = called[1] as RequestInit;
      expect(requestInit.method).toBe("GET");
      expect(requestInit.credentials).toBe("include");
    });

    it("throws with the server's error message on non-2xx responses", async () => {
      // Arrange
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse(
          { code: "FORBIDDEN", message: "You do not have access to this ticket" },
          { status: 403, statusText: "Forbidden" },
        ),
      );

      // Act + Assert
      await expect(listAttachments("proj-1", 7)).rejects.toThrow(
        "You do not have access to this ticket",
      );
    });

    it("falls back to statusText when the error body is not JSON", async () => {
      // Arrange
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("not json", { status: 500, statusText: "Internal Server Error" }),
      );

      // Act + Assert
      await expect(listAttachments("proj-1", 7)).rejects.toThrow("Internal Server Error");
    });
  });

  describe("uploadAttachment", () => {
    it("POSTs the file as multipart/form-data under the `file` field and unwraps the { attachment } envelope", async () => {
      // Arrange
      const file = new File(["hello"], "screenshot.png", { type: "image/png" });
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse({ attachment: SAMPLE_ATTACHMENT }),
      );

      // Act
      const result = await uploadAttachment("proj-1", 7, file);

      // Assert
      expect(result.id).toBe("att-1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const called = fetchMock.mock.calls[0];
      expect(called[0]).toBe("/api/v1/projects/proj-1/tickets/7/attachments");
      const requestInit = called[1] as RequestInit;
      expect(requestInit.method).toBe("POST");
      expect(requestInit.credentials).toBe("include");
      expect(requestInit.body).toBeInstanceOf(FormData);
      // Critically: must NOT set Content-Type — the browser fills in the multipart boundary.
      expect(requestInit.headers).toBeUndefined();
      const formData = requestInit.body as FormData;
      expect(formData.get("file")).toBe(file);
    });

    it("throws AttachmentFileTooLargeError before any network call when the file exceeds 8 MB", async () => {
      // Arrange — 9 MB file
      const oversized = new File(
        [new Uint8Array(9 * 1024 * 1024)],
        "huge.png",
        { type: "image/png" },
      );
      const fetchMock = vi.spyOn(globalThis, "fetch");

      // Act + Assert
      await expect(uploadAttachment("proj-1", 7, oversized)).rejects.toBeInstanceOf(
        AttachmentFileTooLargeError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws the server's error message when the upload is rejected", async () => {
      // Arrange
      const file = new File(["hi"], "x.png", { type: "image/png" });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse(
          { code: "BAD_REQUEST", message: "File too large" },
          { status: 413, statusText: "Payload Too Large" },
        ),
      );

      // Act + Assert
      await expect(uploadAttachment("proj-1", 7, file)).rejects.toThrow("File too large");
    });
  });

  describe("deleteAttachment", () => {
    it("DELETEs the right URL with no body", async () => {
      // Arrange
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        emptyResponse({ status: 200 }),
      );

      // Act
      await deleteAttachment("proj-1", 7, "att-1");

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const called = fetchMock.mock.calls[0];
      expect(called[0]).toBe("/api/v1/projects/proj-1/tickets/7/attachments/att-1");
      const requestInit = called[1] as RequestInit;
      expect(requestInit.method).toBe("DELETE");
      expect(requestInit.credentials).toBe("include");
      expect(requestInit.body).toBeUndefined();
    });

    it("throws with the server's error message on non-2xx responses", async () => {
      // Arrange
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse(
          { code: "NOT_FOUND", message: "Attachment not found" },
          { status: 404, statusText: "Not Found" },
        ),
      );

      // Act + Assert
      await expect(deleteAttachment("proj-1", 7, "att-1")).rejects.toThrow(
        "Attachment not found",
      );
    });
  });
});