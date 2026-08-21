import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex w-full rounded-lg bg-trakk-surface border border-trakk-border",
        "px-3.5 py-2.5 text-[15px] font-body text-trakk-text",
        "placeholder:text-trakk-text-secondary",
        "transition-colors duration-200",
        "focus:outline-none focus:border-trakk-teal focus:ring-2 focus:ring-[var(--trakk-teal-border)]",
        "focus:ring-offset-2 focus:ring-offset-trakk-bg",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
