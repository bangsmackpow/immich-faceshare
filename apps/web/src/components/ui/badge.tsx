import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const styles: Record<Variant, string> = {
  default: "bg-zinc-800 text-zinc-300",
  success: "bg-emerald-900/50 text-emerald-300",
  warning: "bg-amber-900/50 text-amber-300",
  danger: "bg-red-900/50 text-red-300",
  info: "bg-blue-900/50 text-blue-300",
};

interface Props {
  variant?: Variant;
  children: ReactNode;
}

export function Badge({ variant = "default", children }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
