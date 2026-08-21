import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

/**
 * Native-select-backed picker styled to match the ACE Dev identity. Used for
 * status / priority / assignee pickers. Native select keeps it accessible and
 * fully controllable in the Vitest/jsdom test environment.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex w-full appearance-none rounded-lg bg-trakk-surface border border-trakk-border',
          'pl-3.5 pr-9 py-2.5 text-[15px] font-body text-trakk-text',
          'transition-colors duration-200 cursor-pointer',
          'focus:outline-none focus:border-trakk-teal focus:ring-2 focus:ring-[var(--trakk-teal-border)]',
          'focus:ring-offset-2 focus:ring-offset-trakk-bg',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-trakk-text-secondary"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
