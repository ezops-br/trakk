import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAttachments } from "./use-attachments";
import { AttachmentFileTooLargeError } from "@/lib/attachments";

const PROJECT_ID = "proj-uuid-1";
const TICKET_NUMBER = 42;
const ATTACHMENT_ID = "att-uuid-1";

const SAMPLE_ATTACHMENT = {
  id: ATTACHMENT_ID,
  ticketId: "ticket-uuid-1",
  uploaderId: "user-uuid-1",
  uploaderDisplayName: "Alice",
  url: `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/attachments/${ATTACHMENT_ID}/raw`,
  mimeType: "image/png",
  originalName: "screenshot.png",
  sizeBytes: 1024,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const OTHER_ATTACHMENT = {
  ...SAMPLE_ATTACHMENT,
  id: "att-uuid-2",
  originalName: "second.png",
};

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status = 200): Response {
  return new Response(null, { status });
}

describe("useAttachments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initial state: loading=true, attachments=[], error=null when enabled", () => {
    // Arrange — never resolves so we observe initial state
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );

    // Assert
    expect(result.current.loading).toBe(true);
    expect(result.current.attachments).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("successful fetch: populates attachments array, loading=false, error=null", async () => {
    // Arrange
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ attachments: [SAMPLE_ATTACHMENT, OTHER_ATTACHMENT] }),
    );

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attachments).toHaveLength(2);
    expect(result.current.attachments[0].id).toBe(ATTACHMENT_ID);
    expect(result.current.error).toBeNull();
  });

  it("enabled=false: skips the initial fetch and stays in not-loading state", () => {
    // Arrange
    const fetchMock = vi.spyOn(globalThis, "fetch");

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, false),
    );

    // Assert
    expect(result.current.loading).toBe(false);
    expect(result.current.attachments).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch error: sets error string, attachments stays empty, loading=false", async () => {
    // Arrange
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ message: "Forbidden" }, { status: 403 }),
    );

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attachments).toEqual([]);
    expect(result.current.error).toBe("Forbidden");
  });

  it("upload: POSTs the file, refetches the list, returns the created attachment", async () => {
    // Arrange
    const file = new File(["hello"], "screenshot.png", { type: "image/png" });
    const created = { ...SAMPLE_ATTACHMENT, originalName: "screenshot.png" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // 1: initial list (empty)
      .mockResolvedValueOnce(jsonResponse({ attachments: [] }))
      // 2: POST upload → returns the new attachment
      .mockResolvedValueOnce(jsonResponse({ attachment: created }))
      // 3: refetch after upload → returns the new list
      .mockResolvedValueOnce(jsonResponse({ attachments: [created] }));

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.upload(file);
    });

    // Assert — return value
    expect(returned).toMatchObject({ id: ATTACHMENT_ID, originalName: "screenshot.png" });

    // Assert — state reflects refetch
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].id).toBe(ATTACHMENT_ID);

    // Assert — POST call used FormData with the file under "file", no Content-Type
    const postCall = fetchMock.mock.calls[1];
    expect(postCall[0]).toBe("/api/v1/projects/proj-uuid-1/tickets/42/attachments");
    const postInit = postCall[1] as RequestInit;
    expect(postInit.method).toBe("POST");
    expect(postInit.body).toBeInstanceOf(FormData);
    expect(postInit.headers).toBeUndefined();
    expect((postInit.body as FormData).get("file")).toBe(file);

    // Assert — the post-upload refetch happened
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refetchCall = fetchMock.mock.calls[2];
    const refetchInit = refetchCall[1] as RequestInit;
    expect(refetchInit.method).toBe("GET");
  });

  it("upload: throws AttachmentFileTooLargeError before any network call when file > 8 MB", async () => {
    // Arrange
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ attachments: [] }),
    );
    const oversized = new File(
      [new Uint8Array(9 * 1024 * 1024)],
      "huge.png",
      { type: "image/png" },
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const beforeCalls = fetchMock.mock.calls.length;

    await act(async () => {
      await expect(result.current.upload(oversized)).rejects.toBeInstanceOf(
        AttachmentFileTooLargeError,
      );
    });

    // Assert — no extra network call was made
    expect(fetchMock.mock.calls.length).toBe(beforeCalls);
  });

  it("remove: DELETEs the right URL and refetches the list", async () => {
    // Arrange
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // 1: initial list (both attachments)
      .mockResolvedValueOnce(
        jsonResponse({ attachments: [SAMPLE_ATTACHMENT, OTHER_ATTACHMENT] }),
      )
      // 2: DELETE → success
      .mockResolvedValueOnce(emptyResponse(200))
      // 3: refetch after delete → only the other one remains
      .mockResolvedValueOnce(jsonResponse({ attachments: [OTHER_ATTACHMENT] }));

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attachments).toHaveLength(2);

    await act(async () => {
      await result.current.remove(ATTACHMENT_ID);
    });

    // Assert — DELETE was issued with no body
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall[0]).toBe(
      "/api/v1/projects/proj-uuid-1/tickets/42/attachments/att-uuid-1",
    );
    const deleteInit = deleteCall[1] as RequestInit;
    expect(deleteInit.method).toBe("DELETE");
    expect(deleteInit.body).toBeUndefined();

    // Assert — state reflects refetch
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].id).toBe("att-uuid-2");

    // Assert — the post-delete refetch happened
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refetchCall = fetchMock.mock.calls[2];
    const refetchInit = refetchCall[1] as RequestInit;
    expect(refetchInit.method).toBe("GET");
  });

  it("refetch: re-fetches and replaces the attachments array", async () => {
    // Arrange
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ attachments: [SAMPLE_ATTACHMENT] }))
      .mockResolvedValueOnce(
        jsonResponse({ attachments: [SAMPLE_ATTACHMENT, OTHER_ATTACHMENT] }),
      );

    // Act
    const { result } = renderHook(() =>
      useAttachments(PROJECT_ID, TICKET_NUMBER, true),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.attachments).toHaveLength(1);

    await act(async () => {
      await result.current.refetch();
    });

    // Assert
    await waitFor(() => expect(result.current.attachments).toHaveLength(2));
  });
});
