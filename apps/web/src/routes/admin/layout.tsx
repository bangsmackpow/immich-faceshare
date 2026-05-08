import { useAuth } from "../../lib/auth";
import { Navigate, NavLink } from "react-router-dom";
import type { ReactNode } from "react";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "text-zinc-100 font-medium"
    : "text-zinc-400 transition-colors hover:text-zinc-100";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-100">FaceShare Admin</h1>
          <nav className="flex gap-4 text-sm">
            <NavLink to="/admin" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/admin/playground" className={navLinkClass}>
              Playground
            </NavLink>
            <NavLink to="/admin/logs" className={navLinkClass}>
              Logs
            </NavLink>
            <NavLink
              to="/"
              className="text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Back to app
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
