import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full min-h-[88px] rounded-lg bg-trakk-surface border border-trakk-border",
        "px-3.5 py-2.5 text-[15px] font-body text-trakk-text leading-relaxed",
        "placeholder:text-trakk-text-secondary resize-y",
        "transition-colors duration-200",
        "focus:outline-none focus:border-trakk-teal focus:ring-2 focus:ring-[var(--trakk-teal-border)]",
        "focus:ring-offset-2 focus:ring-offset-trakk-bg",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
