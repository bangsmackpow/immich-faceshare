import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import Masonry from "react-masonry-css";
import { api } from "../../lib/api";
import { useToast } from "../../components/shared/toast";
import {
  PageTransition,
  CardHover,
  FadeIn,
} from "../../components/animations";
import { GallerySkeleton } from "../../components/shared/skeleton";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Download, X, ChevronLeft, ChevronRight } from "lucide-react";

interface Asset {
  id: string;
  immichAssetId: string;
  thumbnailUrl: string;
  exif: string | null;
  createdAt: string;
}

interface DownloadJob {
  id: string;
  status: string;
  zipPath: string | null;
}

const breakpointColumns = {
  default: 4,
  1024: 3,
  640: 2,
  480: 1,
};

export default function Gallery() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets", personId],
    queryFn: () => api<{ data: Asset[] }>(`/api/assets/${personId}`),
    enabled: !!personId,
  });

  const downloadMutation = useMutation({
    mutationFn: () =>
      api<{ data: DownloadJob }>("/api/downloads", {
        method: "POST",
        body: JSON.stringify({ personId }),
      }),
    onSuccess: () => {
      toast("Download queued — you'll be notified when ready", "success");
    },
    onError: (err: Error) => {
      toast(err.message, "error");
    },
  });

  const assets = data?.data ?? [];

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-zinc-950 p-4 pt-8">
          <GallerySkeleton />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <p className="text-zinc-400">
              You don&apos;t have access to this gallery.
            </p>
            <Button
              variant="ghost"
              onClick={() => navigate("/people")}
              className="mt-4"
            >
              Back to People
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-zinc-950">
        <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <button
              onClick={() => navigate("/people")}
              className="flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <Button
              variant="secondary"
              onClick={() => downloadMutation.mutate()}
              loading={downloadMutation.isPending}
            >
              <Download size={14} />
              Download All
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8">
          <FadeIn>
            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-zinc-500">
                  No photos found for this person
                </p>
              </div>
            ) : (
              <Masonry
                breakpointCols={breakpointColumns}
                className="flex -ml-4 w-auto"
                columnClassName="pl-4 space-y-4"
              >
                {assets.map((asset, index) => (
                  <CardHover key={asset.id}>
                    <button
                      onClick={() => setLightboxIndex(index)}
                      className="group relative block w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                      aria-label={`Photo ${index + 1}`}
                    >
                      <img
                        src={asset.thumbnailUrl}
                        alt={`Photo ${index + 1}`}
                        className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </button>
                  </CardHover>
                ))}
              </Masonry>
            )}
          </FadeIn>
        </main>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          assets={assets}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((i) =>
              i !== null ? (i - 1 + assets.length) % assets.length : null,
            )
          }
          onNext={() =>
            setLightboxIndex((i) =>
              i !== null ? (i + 1) % assets.length : null,
            )
          }
        />
      )}
    </PageTransition>
  );
}

function Lightbox({
  assets,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  assets: Asset[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const asset = assets[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${assets.length}`}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      <button
        onClick={onPrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        aria-label="Previous photo"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        onClick={onNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        aria-label="Next photo"
      >
        <ChevronRight size={24} />
      </button>

      <img
        src={asset?.thumbnailUrl}
        alt={`Photo ${index + 1}`}
        className="max-h-full max-w-full rounded-lg object-contain"
      />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white">
        {index + 1} / {assets.length}
      </div>
    </div>
  );
}
