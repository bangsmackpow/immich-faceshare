import type { ReactNode } from "react";

interface Props {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900 p-4 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">{title}</h3>
      )}
      {children}
    </div>
  );
}
