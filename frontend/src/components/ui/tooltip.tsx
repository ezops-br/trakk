'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight tooltip primitive — mirrors Radix's `Tooltip` / `TooltipTrigger`
 * / `TooltipContent` naming so that a future swap to
 * `@radix-ui/react-tooltip` is non-breaking for callers.
 *
 * Behavior contract (iteration 1):
 *   - opens on `pointerenter` (mouse) or `focus` (keyboard) of the trigger;
 *   - closes on `pointerleave` of trigger, `blur` of trigger, `Escape`,
 *     or `pointerdown` outside trigger and content;
 *   - content is anchored below the trigger, left-aligned, 8px offset;
 *   - when open, content has `role="tooltip"` and the trigger is wired with
 *     `aria-describedby="<content-id>"`.
 *
 * Implementation note (Business Logic #1 of the brief):
 *   - The `Tooltip` wrapper renders a `relative inline-block` `<span>`
 *     that hosts the cloned trigger child; the absolute content sits as a
 *     sibling of the cloned trigger inside that wrapper. There is no
 *     `asChild` flag — wrapping the user's element with the same span is
 *     always safe (inline-block) and matches `popover.tsx`'s relative
 *     container shape.
 *   - The implementation is fully hand-rolled. It does NOT import from any
 *     Radix package in its public API; the project precedent
 *     (`popover.tsx`) is also dependency-free.
 *
 * No `package.json` change; no animations; no rounded-pill; no eyebrow label.
 */

interface TooltipContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contentId: string;
  triggerRef: React.RefObject<HTMLSpanElement | null>;
  wrapperRef: React.RefObject<HTMLSpanElement | null>;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext(component: string): TooltipContextValue {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside <Tooltip>.`);
  }
  return ctx;
}

interface TooltipProps {
  children: React.ReactNode;
}

/**
 * Provides the open-state machine for a single tooltip. Mount exactly one
 * `<TooltipTrigger>` and one `<TooltipContent>` as descendants.
 */
export function Tooltip({ children }: TooltipProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const contentId = React.useId();
  const wrapperRef = React.useRef<HTMLSpanElement>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const value = React.useMemo<TooltipContextValue>(
    () => ({ open, setOpen, contentId, triggerRef, wrapperRef }),
    [open, contentId],
  );

  return (
    <TooltipContext.Provider value={value}>
      <span ref={wrapperRef} className="relative inline-block">
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

interface TooltipTriggerProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * A single React element to attach the hover/focus listeners to. The
   * element is cloned; the original element's tag is preserved.
   */
  children: React.ReactElement;
}

/**
 * Clones its single child and attaches the open/close event handlers. The
 * child becomes the interactive trigger; the wrapping `<span>` from the
 * parent `<Tooltip>` remains the positioning anchor.
 */
export const TooltipTrigger = React.forwardRef<HTMLElement, TooltipTriggerProps>(
  function TooltipTrigger({ children, ...rest }, forwardedRef) {
    const { setOpen, contentId, open: isOpen, triggerRef } = useTooltipContext(
      'TooltipTrigger',
    );

    const handlePointerEnter = React.useCallback(() => {
      setOpen(true);
    }, [setOpen]);
    const handlePointerLeave = React.useCallback(() => {
      setOpen(false);
    }, [setOpen]);
    const handleFocus = React.useCallback(() => {
      setOpen(true);
    }, [setOpen]);
    const handleBlur = React.useCallback(() => {
      setOpen(false);
    }, [setOpen]);

    // Compose the forwarded ref with the internal triggerRef so consumers
    // that pass a ref get the cloned DOM element.
    const composedRef = React.useCallback(
      (node: HTMLElement | null) => {
        (triggerRef as React.MutableRefObject<HTMLSpanElement | null>).current =
          node as HTMLSpanElement | null;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLElement | null>).current =
            node;
        }
      },
      [forwardedRef, triggerRef],
    );

    const childProps = children.props as Record<string, unknown>;
    return React.cloneElement(children, {
      ...rest,
      ref: composedRef,
      'aria-describedby': isOpen ? contentId : childProps['aria-describedby'],
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
    } as Record<string, unknown>);
  },
);

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The tooltip's body. Kept as a small theme-locked panel.
   */
  children: React.ReactNode;
}

/**
 * The tooltip's panel — only mounts when the tooltip is open. Anchored
 * below the trigger's left edge with an 8px gap (`mt-2`).
 */
export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  function TooltipContent({ children, className, ...rest }, forwardedRef) {
    const { open, contentId } = useTooltipContext('TooltipContent');
    if (!open) return null;

    return (
      <div
        ref={forwardedRef}
        id={contentId}
        role="tooltip"
        className={cn(
          'absolute left-0 top-full',
          'mt-2 z-50',
          'bg-trakk-surface text-trakk-text border border-trakk-border shadow-card',
          'rounded-md px-2 py-1',
          'font-mono text-[11px]',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);