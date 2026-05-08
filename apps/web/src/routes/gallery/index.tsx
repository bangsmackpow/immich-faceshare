import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import Masonry from "react-masonry-css";
import { api } from "../../lib/api";
import { useToast } from "../../components/shared/toast";
import { PageTransition, CardHover, FadeIn } from "../../components/animations";
import { GallerySkeleton } from "../../components/shared/skeleton";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Download, X, ChevronLeft, ChevronRight, Check, Filter, Calendar, Camera, MapPin, RefreshCw } from "lucide-react";

interface Asset {
  id: string;
  immichAssetId: string;
  signedUrl: string;
  exif: string | null;
}

interface ExifData {
  dateTimeOriginal: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  model: string | null;
}

interface DownloadResult {
  data: { id: string; status: string };
}

interface GalleryFilters {
  dateFrom: string;
  dateTo: string;
  cameraModel: string;
  location: string;
}

const breakpointColumns = { default: 4, 1024: 3, 640: 2, 480: 1 };
const MAX_SELECTION = 100;

export default function Gallery() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<GalleryFilters>({
    dateFrom: "",
    dateTo: "",
    cameraModel: "",
    location: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets", personId],
    queryFn: () => api<{ data: Asset[] }>(`/api/assets/${personId}`),
    enabled: !!personId,
  });

  const assets = data?.data ?? [];

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const exif: ExifData | null = asset.exif ? JSON.parse(asset.exif) : null;
      if (!exif) return !Object.values(filters).some(Boolean);

      if (filters.dateFrom) {
        const assetDate = exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal) : null;
        if (assetDate && assetDate < new Date(filters.dateFrom)) return false;
      }

      if (filters.dateTo) {
        const assetDate = exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal) : null;
        if (assetDate && assetDate > new Date(filters.dateTo + "T23:59:59")) return false;
      }

      if (filters.cameraModel) {
        const model = exif.model?.toLowerCase() ?? "";
        if (!model.includes(filters.cameraModel.toLowerCase())) return false;
      }

      if (filters.location) {
        const location = filters.location.toLowerCase();
        const city = exif.city?.toLowerCase() ?? "";
        const country = exif.country?.toLowerCase() ?? "";
        if (!city.includes(location) && !country.includes(location)) return false;
      }

      return true;
    });
  }, [assets, filters]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const clearFilters = () => setFilters({ dateFrom: "", dateTo: "", cameraModel: "", location: "" });

  const downloadMutation = useMutation({
    mutationFn: (assetIds?: string[]) =>
      api<DownloadResult>("/api/downloads", {
        method: "POST",
        body: JSON.stringify({
          personId,
          assetIds: assetIds && assetIds.length > 0 ? assetIds : undefined,
        }),
      }),
    onSuccess: () => toast("Download queued — you'll be notified when ready", "success"),
    onError: (err: Error) => toast(err.message, "error"),
  });

  const resyncMutation = useMutation({
    mutationFn: () =>
      api<{ newAssets: number; updatedExif: number }>(`/api/assets/${personId}/resync`, {
        method: "POST",
      }),
    onSuccess: (result) => {
      const parts = [];
      if (result.newAssets > 0) parts.push(`${result.newAssets} new`);
      if (result.updatedExif > 0) parts.push(`${result.updatedExif} updated`);
      toast(parts.length > 0 ? `Resync complete: ${parts.join(", ")}` : "No changes found", "success");
      queryClient.invalidateQueries({ queryKey: ["assets", personId] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const selectedCount = selected.size;

  const toggleSelect = useCallback((assetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else if (next.size < MAX_SELECTION) next.add(assetId);
      else toast(`Maximum selection is ${MAX_SELECTION} photos`, "info");
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  const handleDownloadAll = () => downloadMutation.mutate(undefined);
  const handleDownloadSelected = () => {
    if (selectedCount === 0) {
      toast("Select photos first", "info");
      return;
    }
    const ids = assets
      .filter((a) => selected.has(a.immichAssetId))
      .map((a) => a.immichAssetId);
    downloadMutation.mutate(ids);
    clearSelection();
  };

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
            <p className="text-zinc-400">You don&apos;t have access to this gallery.</p>
            <Button variant="ghost" onClick={() => navigate("/people")} className="mt-4">
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
          <div className="mx-auto max-w-7xl px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate("/people")}
                className="flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
              >
                <ArrowLeft size={16} />
                Back
              </button>

              <div className="flex items-center gap-2" style={{ contentVisibility: "auto" }}>
                <Button
                  variant="ghost"
                  onClick={() => resyncMutation.mutate()}
                  loading={resyncMutation.isPending}
                >
                  <RefreshCw size={14} />
                </Button>
                <Button
                  variant={hasActiveFilters ? "primary" : "ghost"}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter size={14} />
                  {hasActiveFilters && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-zinc-900">
                      {Object.values(filters).filter(Boolean).length}
                    </span>
                  )}
                </Button>
                {selectedCount > 0 && (
                  <>
                    <span className="text-xs text-zinc-500">{selectedCount} selected</span>
                    <Button variant="ghost" onClick={clearSelection}>
                      <X size={14} />
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleDownloadSelected}
                      loading={downloadMutation.isPending}
                    >
                      <Download size={14} />
                      Download ({selectedCount})
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  onClick={handleDownloadAll}
                  loading={downloadMutation.isPending}
                >
                  <Download size={14} />
                  All
                </Button>
              </div>
            </div>

            {showFilters && (
              <div className="mt-3 grid gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
                    <Calendar size={12} /> Date from
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
                    <Calendar size={12} /> Date to
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
                    <Camera size={12} /> Camera
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Canon, iPhone"
                    value={filters.cameraModel}
                    onChange={(e) => setFilters({ ...filters, cameraModel: e.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
                    <MapPin size={12} /> Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paris, Japan"
                    value={filters.location}
                    onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                {hasActiveFilters && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Button variant="ghost" onClick={clearFilters} className="text-xs">
                      Clear all filters
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8" style={{ contentVisibility: "auto" }}>
          <FadeIn>
            {filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-zinc-500">
                  {assets.length === 0
                    ? "No photos found for this person"
                    : "No photos match your filters"}
                </p>
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters} className="mt-2">
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                {hasActiveFilters && (
                  <p className="mb-4 text-sm text-zinc-500">
                    Showing {filteredAssets.length} of {assets.length} photos
                  </p>
                )}
                <Masonry
                  breakpointCols={breakpointColumns}
                  className="flex -ml-4 w-auto"
                  columnClassName="pl-4 space-y-4"
                >
                  {filteredAssets.map((asset, index) => {
                    const isSelected = selected.has(asset.immichAssetId);
                    return (
                      <CardHover key={asset.id}>
                        <div className="group relative">
                          <button
                            onClick={() => setLightboxIndex(index)}
                            className="block w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                            aria-label={`Photo ${index + 1}`}
                          >
                            <img
                              src={asset.signedUrl}
                              alt={`Photo ${index + 1}`}
                              className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(asset.immichAssetId);
                            }}
                            className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-zinc-500 bg-black/50 opacity-0 group-hover:opacity-100"
                            }`}
                            aria-label={isSelected ? "Deselect" : "Select photo"}
                          >
                            {isSelected && <Check size={14} />}
                          </button>
                        </div>
                      </CardHover>
                    );
                  })}
                </Masonry>
              </>
            )}
          </FadeIn>
        </main>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          assets={filteredAssets}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((i) => (i !== null ? (i - 1 + filteredAssets.length) % filteredAssets.length : null))
          }
          onNext={() =>
            setLightboxIndex((i) => (i !== null ? (i + 1) % filteredAssets.length : null))
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
        aria-label="Previous"
      >
        <ChevronLeft size={24} />
      </button>
      <button
        onClick={onNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        aria-label="Next"
      >
        <ChevronRight size={24} />
      </button>
      <img
        src={asset?.signedUrl}
        alt={`Photo ${index + 1}`}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white">
        {index + 1} / {assets.length}
      </div>
    </div>
  );
}
