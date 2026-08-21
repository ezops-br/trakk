'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * Lightweight popover: an anchored panel toggled by a trigger, dismissed on
 * outside click or Escape. Kept dependency-free and testable in jsdom.
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  className,
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute z-50 mt-2 min-w-[200px] rounded-panel border border-trakk-border',
            'bg-trakk-surface p-1 shadow-card',
            'animate-in fade-in-0 zoom-in-95 duration-150 ease-ace-enter',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
