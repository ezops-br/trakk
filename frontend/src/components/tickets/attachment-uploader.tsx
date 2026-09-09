import * as React from "react";
import { Button } from "@/components/ui/button";

export interface AttachmentUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Compose-time attachment picker used by `CreateTicketDialog`.
 * Stateless — the parent owns the array, so the dialog can upload files
 * after the ticket is created (the backend requires `:ticketNumber`).
 */
export function AttachmentUploader({
  files,
  onChange,
  maxBytes = DEFAULT_MAX_BYTES,
}: AttachmentUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [previews, setPreviews] = React.useState<
    { name: string; url: string }[]
  >([]);

  // Generate / revoke object URLs whenever the file list changes.
  React.useEffect(() => {
    const next = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPreviews(next);
    return () => {
      next.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [files]);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) {
      event.target.value = "";
      return;
    }

    setError(null);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of picked) {
      if (file.size > maxBytes) {
        rejected.push(file.name);
        continue;
      }
      accepted.push(file);
    }

    if (rejected.length > 0) {
      setError(
        rejected.length === 1
          ? `"${rejected[0]}" is too large (max ${formatBytes(maxBytes)}).`
          : `${rejected.length} files exceed the ${formatBytes(maxBytes)} limit.`,
      );
    }

    onChange([...files, ...accepted]);
    // Reset so picking the same file again re-triggers `onChange`.
    event.target.value = "";
  };

  const handleRemove = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2" data-testid="attachment-uploader">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePick}
          className="sr-only"
          data-testid="attachment-uploader-input"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Attach images
        </Button>
        <span className="text-xs text-trakk-text-secondary">
          {files.length === 0
            ? "No images selected"
            : `${files.length} selected`}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          className="text-xs text-status-error"
          data-testid="attachment-uploader-error"
        >
          {error}
        </p>
      ) : null}

      {previews.length > 0 ? (
        <ul
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          data-testid="attachment-uploader-previews"
        >
          {previews.map((preview, index) => (
            <li
              key={preview.url}
              className="group relative aspect-square overflow-hidden rounded-lg border border-trakk-border bg-trakk-surface-alt"
              data-testid="attachment-uploader-preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${preview.name}`}
                onClick={() => handleRemove(index)}
                className="absolute right-1 top-1 rounded-full bg-trakk-bg/80 px-2 py-0.5 text-xs text-trakk-text hover:bg-status-error hover:text-white"
                data-testid="attachment-uploader-remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}