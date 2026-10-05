'use client';

import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useCommandPalette } from '@/components/layout/CommandPaletteProvider';

export function SearchTrigger() {
  const { open } = useCommandPalette();
  // Read the platform after mount: the server has no navigator and renders
  // "Ctrl+K", so deciding during render made Mac browsers fail hydration.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  const kbdLabel = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <button
      onClick={open}
      aria-label="Open command palette"
      className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-trakk-surface-alt border border-trakk-border text-trakk-text-secondary text-sm transition-colors hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-text cursor-pointer select-none w-8 md:w-[200px] justify-center md:justify-start"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="hidden md:inline truncate">Search...</span>
      <kbd className="hidden md:inline-flex ml-auto items-center rounded border border-trakk-border px-1.5 py-0.5 text-[10px] font-mono text-trakk-text-secondary bg-trakk-bg">
        {kbdLabel}
      </kbd>
    </button>
  );
}
