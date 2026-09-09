import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttachmentUploader } from './attachment-uploader';

function makeFile(name: string, sizeBytes: number, type: string): File {
  // Construct a File with a specific size without writing that many bytes
  // to disk — `blobParts` can be a single byte repeated via a builder.
  const buffer = new Uint8Array(sizeBytes);
  return new File([buffer], name, { type });
}

// Set `files` on a real <input>. jsdom doesn't allow redefining the native
// `files` property more than once without `configurable: true`, which the
// browser does for us via the file picker — we have to add it explicitly
// when calling RTL's `fireEvent.change` on a manually-attached fake.
function setFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

describe('AttachmentUploader', () => {
  it('renders the empty-state prompt when no files are selected', () => {
    const onChange = vi.fn();
    render(<AttachmentUploader files={[]} onChange={onChange} />);

    expect(screen.getByTestId('attachment-uploader')).toBeInTheDocument();
    expect(screen.getByText('No images selected')).toBeInTheDocument();
    expect(screen.getByText('Attach images')).toBeInTheDocument();
  });

  it('calls onChange with the new array when a file is picked', () => {
    const onChange = vi.fn();
    render(<AttachmentUploader files={[]} onChange={onChange} />);

    const input = screen.getByTestId('attachment-uploader-input') as HTMLInputElement;
    const file = makeFile('a.png', 1024, 'image/png');
    setFiles(input, [file]);
    fireEvent.change(input);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it('appends picked files to the existing array', () => {
    const onChange = vi.fn();
    const existing = makeFile('existing.png', 1024, 'image/png');
    render(<AttachmentUploader files={[existing]} onChange={onChange} />);

    const input = screen.getByTestId('attachment-uploader-input') as HTMLInputElement;
    const next = makeFile('next.png', 2048, 'image/png');
    setFiles(input, [next]);
    fireEvent.change(input);

    expect(onChange).toHaveBeenCalledWith([existing, next]);
  });

  it('renders a thumbnail preview for each file in the current list', () => {
    const onChange = vi.fn();
    const a = makeFile('a.png', 1024, 'image/png');
    const b = makeFile('b.png', 2048, 'image/png');
    render(<AttachmentUploader files={[a, b]} onChange={onChange} />);

    const items = screen.getAllByTestId('attachment-uploader-preview');
    expect(items).toHaveLength(2);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('calls onChange without the removed file when a thumbnail ✕ is clicked', () => {
    const onChange = vi.fn();
    const a = makeFile('a.png', 1024, 'image/png');
    const b = makeFile('b.png', 2048, 'image/png');
    render(<AttachmentUploader files={[a, b]} onChange={onChange} />);

    const removeButtons = screen.getAllByTestId('attachment-uploader-remove');
    fireEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([b]);
  });

  it('rejects files larger than maxBytes and shows an inline error', () => {
    const onChange = vi.fn();
    render(
      <AttachmentUploader files={[]} onChange={onChange} maxBytes={1024} />,
    );

    const input = screen.getByTestId('attachment-uploader-input') as HTMLInputElement;
    const big = makeFile('big.png', 4096, 'image/png');
    setFiles(input, [big]);
    fireEvent.change(input);

    expect(onChange).toHaveBeenCalledWith([]); // oversized file dropped
    const error = screen.getByTestId('attachment-uploader-error');
    expect(error).toBeInTheDocument();
    expect(error.textContent).toMatch(/too large/);
  });

  it('keeps small files and shows a per-file error when a single pick is too large', () => {
    const onChange = vi.fn();
    render(
      <AttachmentUploader files={[]} onChange={onChange} maxBytes={2048} />,
    );

    const input = screen.getByTestId('attachment-uploader-input') as HTMLInputElement;
    const small = makeFile('small.png', 1024, 'image/png');
    const big = makeFile('big.png', 4096, 'image/png');
    setFiles(input, [small, big]);
    fireEvent.change(input);

    // Only the small file is added; the big one is dropped with a single-file
    // error message naming it.
    expect(onChange).toHaveBeenCalledWith([small]);
    const error = screen.getByTestId('attachment-uploader-error');
    expect(error.textContent).toMatch(/"big\.png" is too large/);
  });

  it('shows a multi-file error when several picks are rejected at once', () => {
    const onChange = vi.fn();
    render(
      <AttachmentUploader files={[]} onChange={onChange} maxBytes={1024} />,
    );

    const input = screen.getByTestId('attachment-uploader-input') as HTMLInputElement;
    const big1 = makeFile('big1.png', 2048, 'image/png');
    const big2 = makeFile('big2.png', 4096, 'image/png');
    setFiles(input, [big1, big2]);
    fireEvent.change(input);

    expect(onChange).toHaveBeenCalledWith([]);
    const error = screen.getByTestId('attachment-uploader-error');
    expect(error.textContent).toMatch(/2 files/);
  });

  it('clears the inline error once a subsequent pick succeeds', () => {
    const onChange = vi.fn();
    render(
      <AttachmentUploader files={[]} onChange={onChange} maxBytes={1024} />,
    );

    const input = screen.getByTestId('attachment-uploader-input') as HTMLInputElement;
    const big = makeFile('big.png', 4096, 'image/png');
    setFiles(input, [big]);
    fireEvent.change(input);
    expect(screen.getByTestId('attachment-uploader-error')).toBeInTheDocument();

    const ok = makeFile('ok.png', 512, 'image/png');
    setFiles(input, [ok]);
    fireEvent.change(input);

    expect(screen.queryByTestId('attachment-uploader-error')).toBeNull();
  });
});
