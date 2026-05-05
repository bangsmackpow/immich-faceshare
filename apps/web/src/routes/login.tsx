import { useState, useEffect, useRef } from "react";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageTransition } from "../components/animations";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: { credential: string }) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            options: { theme: string; size: string; text?: string },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => setClientId(cfg.googleClientId))
      .catch(() => setError("Failed to load configuration"));
  }, []);

  useEffect(() => {
    if (!clientId || scriptLoaded.current) return;
    scriptLoaded.current = true;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onerror = () => setError("Failed to load Google Sign-In");
    document.head.appendChild(script);
  }, [clientId]);

  if (user) {
    navigate("/people", { replace: true });
    return null;
  }

  const handleGoogleLogin = () => {
    if (!clientId) {
      setError("Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in your environment.");
      return;
    }
    if (!window.google) {
      setError("Google Sign-In is still loading. Try again.");
      return;
    }
    setLoading(true);
    setError(null);

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (res) => {
        try {
          await login(res.credential);
          navigate("/people", { replace: true });
        } catch {
          setError("Login failed");
          setLoading(false);
        }
      },
    });

    window.google.accounts.id.prompt();

    setTimeout(() => setLoading(false), 30000);
  };

  return (
    <PageTransition>
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <motion.div
          className="w-full max-w-sm text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
              FaceShare
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              View photos of your loved ones
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 disabled:opacity-50"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-200" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {loading ? "Signing in..." : "Sign in with Google"}
          </button>

          <p className="mt-6 text-xs text-zinc-600">
            You need a Google account to access FaceShare.
          </p>
        </motion.div>
      </div>
    </PageTransition>
  );
}
