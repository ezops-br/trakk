import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-badge font-mono text-[10px] tracking-[2px] uppercase px-3 py-1 border transition-colors duration-200",
  {
    variants: {
      variant: {
        teal:    "bg-[var(--trakk-teal-bg)] border-[var(--trakk-teal-border)] text-trakk-teal",
        blue:    "bg-[var(--trakk-blue-bg)] border-[var(--trakk-blue-border)] text-trakk-blue",
        neutral: "bg-[var(--trakk-neutral-bg)] border-[var(--trakk-neutral-border)] text-trakk-text-strong",
        urgent:  "bg-[rgba(255,71,87,0.10)] border-[rgba(255,71,87,0.25)] text-priority-urgent",
        high:    "bg-[rgba(255,140,66,0.10)] border-[rgba(255,140,66,0.25)] text-priority-high",
        medium:  "bg-[rgba(255,200,87,0.10)] border-[rgba(255,200,87,0.25)] text-priority-medium",
        low:     "bg-[rgba(71,184,224,0.10)] border-[rgba(71,184,224,0.25)] text-priority-low",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
