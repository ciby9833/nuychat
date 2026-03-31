import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20 disabled:bg-blue-300",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50",
  ghost:     "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40",
  danger:    "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50",
  outline:   "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm:   "h-7 px-2.5 text-xs rounded-md gap-1",
  md:   "h-8 px-3 text-sm rounded-md gap-1.5",
  lg:   "h-9 px-4 text-sm rounded-lg gap-2",
  icon: "h-8 w-8 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed whitespace-nowrap",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
