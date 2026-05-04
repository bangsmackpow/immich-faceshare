import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
}

export function Modal({
  open,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
}: Props) {
  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">{title}</h2>
        <div className="mb-6 text-sm text-zinc-400">{children}</div>
        <div className="flex justify-end gap-3">
          <button
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
            onClick={onClose}
          >
            Cancel
          </button>
          {onConfirm && (
            <button
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
                confirmVariant === "danger"
                  ? "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500"
                  : "bg-zinc-100 text-zinc-900 hover:bg-zinc-300 focus-visible:ring-zinc-500"
              }`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
