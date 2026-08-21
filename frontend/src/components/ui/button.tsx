import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "font-body font-semibold",
    "transition-all duration-200 ease-ace-enter",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--trakk-teal)]",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-trakk-bg",
    "disabled:opacity-50 disabled:pointer-events-none",
    "active:scale-[0.98]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-brand text-white hover:shadow-glow",
        secondary:
          "bg-transparent border border-trakk-border text-trakk-text hover:bg-[var(--trakk-teal-hover)] hover:border-trakk-teal",
        ghost:
          "bg-transparent text-trakk-text-secondary hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-teal",
        destructive:
          "bg-[rgba(255,71,87,0.1)] border border-[rgba(255,71,87,0.25)] text-status-error hover:bg-[rgba(255,71,87,0.2)]",
      },
      size: {
        default: "px-5 py-2.5 text-[14px]",
        sm:      "px-3 py-1.5 text-[13px]",
        lg:      "px-6 py-3 text-[15px]",
        icon:    "p-2 text-[14px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
