import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { PageTransition, FadeIn } from "../../components/animations";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Download, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface DownloadJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  personId: string;
  error: string | null;
  createdAt: string;
  sizeBytes?: number;
  downloadUrl?: string;
  expiresAt?: string;
}

export default function Downloads() {
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["downloads"],
    queryFn: () => api<{ data: DownloadJob[] }>("/api/downloads"),
    refetchInterval: (q) => {
      const hasPending = q.state.data?.data?.some(
        (j) => j.status === "pending" || j.status === "processing",
      );
      return hasPending ? 3000 : false;
    },
  });

  const jobs = data?.data ?? [];

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const statusIcon = (job: DownloadJob) => {
    switch (job.status) {
      case "completed":
        return <CheckCircle size={18} className="text-emerald-400" />;
      case "failed":
        return <XCircle size={18} className="text-red-400" />;
      case "processing":
        return <Loader2 size={18} className="animate-spin text-amber-400" />;
      default:
        return <Clock size={18} className="text-zinc-500" />;
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-zinc-950">
        <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <button
              onClick={() => navigate("/people")}
              className="flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <h1 className="text-sm font-medium text-zinc-300">Downloads</h1>
            <div />
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-8">
          <FadeIn>
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={24} className="animate-spin text-zinc-500" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Download size={48} className="mb-4 text-zinc-700" />
                <p className="text-zinc-500">No downloads yet</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Go to a gallery and click Download to start
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {statusIcon(job)}
                      <div>
                        <p className="text-sm text-zinc-200 capitalize">{job.status}</p>
                        <p className="text-xs text-zinc-500">{formatDate(job.createdAt)}</p>
                        {job.error && (
                          <p className="mt-1 text-xs text-red-400">{job.error}</p>
                        )}
                        {job.status === "completed" && job.sizeBytes && (
                          <p className="text-xs text-zinc-500">{formatSize(job.sizeBytes)}</p>
                        )}
                      </div>
                    </div>

                    {job.status === "completed" && job.downloadUrl && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          window.location.href = job.downloadUrl!;
                        }}
                      >
                        <Download size={14} />
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </FadeIn>
        </main>
      </div>
    </PageTransition>
  );
}
