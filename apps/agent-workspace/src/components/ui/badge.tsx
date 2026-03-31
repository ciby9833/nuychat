import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";

const variants: Record<BadgeVariant, string> = {
  default:  "bg-slate-100 text-slate-600",
  success:  "bg-green-100 text-green-700",
  warning:  "bg-amber-100 text-amber-700",
  danger:   "bg-red-100 text-red-600",
  info:     "bg-blue-100 text-blue-700",
  outline:  "border border-slate-200 text-slate-600 bg-transparent",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none", variants[variant], className)}
      {...props}
    />
  );
}
