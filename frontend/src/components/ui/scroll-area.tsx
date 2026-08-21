import React from 'react';
import { cn } from '@/lib/utils';

export interface ScrollAreaProps
  extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Themed scroll container. Uses native overflow with a thin teal scrollbar
 * styled via the `trakk-scroll` utility class (defined in globals.css).
 */
const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('overflow-y-auto trakk-scroll', className)}
      {...props}
    >
      {children}
    </div>
  ),
);
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
