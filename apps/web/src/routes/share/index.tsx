import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Lock, Check, AlertCircle, Copy, Download as DownloadIcon } from "lucide-react";

interface ShareInfo {
  personName: string;
  expiresAt: string;
  assetPreview: {
    id: string;
    thumbnailUrl: string;
    exif: string | null;
  };
}

interface VerifyResult {
  token: string;
  assetId: string;
}

async function publicApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export default function SharePage() {
  const { code } = useParams<{ code: string }>();
  const [accessCode, setAccessCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ["share", code],
    queryFn: () => publicApi<ShareInfo>(`/api/share/${code}`),
    enabled: !!code && !verified,
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      publicApi<VerifyResult>(`/api/share/${code}/verify`, {
        method: "POST",
        body: JSON.stringify({ accessCode }),
      }),
    onSuccess: (result) => {
      setToken(result.token);
      setVerified(true);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleVerify = () => {
    if (!accessCode) return;
    setError(null);
    verifyMutation.mutate();
  };

  const handleDownload = () => {
    if (!token || !code) return;
    window.location.href = `/api/share/${code}/download?token=${token}`;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="max-w-md rounded-xl border border-red-900/50 bg-red-950/30 p-8 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
          <h1 className="mb-2 text-xl font-semibold text-red-300">Link Invalid</h1>
          <p className="text-zinc-400">{(queryError as Error).message}</p>
        </div>
      </div>
    );
  }

  if (verified && token && data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Check size={20} className="text-emerald-400" />
            <h1 className="text-lg font-semibold text-zinc-100">
              Photo of {data.personName}
            </h1>
          </div>
          <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800">
            <img
              src={`/api/share/${code}/download?token=${token}`}
              alt={`Photo of ${data.personName}`}
              className="w-full object-contain"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleDownload} className="flex-1">
              <DownloadIcon size={16} />
              Download Full Resolution
            </Button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Link expires {new Date(data.expiresAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <Lock size={24} className="text-zinc-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Photo of {data?.personName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter your access code to view
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-zinc-400">Access code</label>
          <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2">
            <Lock size={16} className="text-zinc-500" />
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="flex-1 bg-transparent text-center text-lg font-mono tracking-widest text-zinc-100 placeholder-zinc-600 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleVerify(); }}
              autoFocus
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Button
          variant="primary"
          onClick={handleVerify}
          loading={verifyMutation.isPending}
          disabled={!accessCode}
          className="w-full"
        >
          <Lock size={14} />
          View Photo
        </Button>

        {data && (
          <p className="mt-4 text-center text-xs text-zinc-600">
            Expires {new Date(data.expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
