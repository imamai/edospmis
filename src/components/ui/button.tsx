import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark active:bg-brand-darker shadow-card disabled:bg-brand/50",
  secondary: "bg-surface text-ink border border-line-strong hover:border-brand hover:text-brand disabled:opacity-50",
  ghost: "text-ink-soft hover:bg-surface-sunk hover:text-ink disabled:opacity-50",
  danger: "bg-critical text-white hover:brightness-110 disabled:opacity-50",
  accent: "bg-accent text-white hover:bg-accent-dark disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || busy}
      {...props}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props}>
      {children}
    </Link>
  );
}
