import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/shared/toast";
import { PageTransition, CardHover, FadeIn, StaggerGrid, StaggerItem } from "../../components/animations";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/shared/skeleton";
import { Modal } from "../../components/ui/modal";
import { Search, User, LogOut, Shield, Download } from "lucide-react";

interface Person {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  assetCount: number;
  hasAccess: boolean;
}

function PersonCard({
  person,
  onRequest,
}: {
  person: Person;
  onRequest: (id: string, name: string) => void;
}) {
  const initials = person.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const gradients = [
    "from-violet-600 to-indigo-600",
    "from-emerald-600 to-teal-600",
    "from-rose-600 to-pink-600",
    "from-amber-600 to-orange-600",
    "from-blue-600 to-cyan-600",
    "from-fuchsia-600 to-purple-600",
  ];
  const gradient = gradients[person.id.charCodeAt(0) % gradients.length];

  return (
    <StaggerItem>
      <CardHover>
        <button
          onClick={() => onRequest(person.id, person.name)}
          className="group w-full rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          aria-label={`View ${person.name}`}
        >
          <div className="mb-3 overflow-hidden rounded-lg">
            {person.thumbnailUrl ? (
              <img
                src={person.thumbnailUrl}
                alt={person.name}
                className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div
                className={`flex aspect-square w-full items-center justify-center bg-gradient-to-br ${gradient}`}
              >
                <span className="text-3xl font-bold text-white/80">
                  {initials}
                </span>
              </div>
            )}
          </div>
          <h3 className="truncate text-sm font-medium text-zinc-100">
            {person.name}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              {person.assetCount} photos
            </span>
            {person.hasAccess && (
              <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                Access
              </span>
            )}
          </div>
        </button>
      </CardHover>
    </StaggerItem>
  );
}

export default function PeopleDirectory() {
  const { user, logout, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, navigate]);
  const [modalPerson, setModalPerson] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["people", search],
    queryFn: () =>
      api<{ data: Person[] }>(
        `/api/people${search ? `?q=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const requestMutation = useMutation({
    mutationFn: (personId: string) =>
      api("/api/requests", {
        method: "POST",
        body: JSON.stringify({ personId }),
      }),
    onSuccess: () => {
      toast("Access request submitted!", "success");
      qc.invalidateQueries({ queryKey: ["people"] });
      setModalPerson(null);
    },
    onError: (err: Error) => {
      toast(err.message, "error");
    },
  });

  const people = data?.data ?? [];
  const approvedPeople = people.filter((p) => p.hasAccess);
  const unrequestedPeople = people.filter((p) => !p.hasAccess);

  return (
    <PageTransition>
      <div className="min-h-screen bg-zinc-950">
        <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <h1 className="text-lg font-bold text-zinc-100">FaceShare</h1>
            <div className="flex items-center gap-3">
              {user && (
                <span className="hidden text-xs text-zinc-500 sm:block">
                  {user.email}
                </span>
              )}
              {user?.role === "admin" && (
                <button
                  onClick={() => navigate("/admin")}
                  className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  aria-label="Admin dashboard"
                >
                  <Shield size={16} />
                </button>
              )}
              <button
                onClick={() => navigate("/downloads")}
                className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Downloads"
              >
                <Download size={16} />
              </button>
              <button
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
                className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8">
          <FadeIn>
            <div className="relative mb-8">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                size={18}
              />
              <input
                type="search"
                placeholder="Search people..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                aria-label="Search people"
              />
            </div>
          </FadeIn>

          {isLoading ? (
            <StaggerGrid className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <StaggerItem key={i}>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <Skeleton className="mb-3 aspect-square w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </StaggerItem>
              ))}
            </StaggerGrid>
          ) : people.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <User className="mb-4 h-12 w-12 text-zinc-700" />
              <h2 className="text-lg font-medium text-zinc-400">
                No people found
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {search
                  ? "Try a different search term"
                  : "People will appear here once synced from Immich"}
              </p>
            </div>
          ) : (
            <>
              {approvedPeople.length > 0 && (
                <section className="mb-10">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                    Your Gallery
                  </h2>
                  <StaggerGrid className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {approvedPeople.map((p) => (
                      <StaggerItem key={p.id}>
                        <CardHover>
                          <button
                            onClick={() => navigate(`/gallery/${p.id}`)}
                            className="group w-full rounded-xl border border-emerald-900/50 bg-zinc-900 p-4 text-left transition-colors hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                            aria-label={`View gallery of ${p.name}`}
                          >
                            <div className="mb-3 overflow-hidden rounded-lg">
                              {p.thumbnailUrl ? (
                                <img
                                  src={p.thumbnailUrl}
                                  alt={p.name}
                                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-600">
                                  <span className="text-3xl font-bold text-white/80">
                                    {p.name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .toUpperCase()
                                      .slice(0, 2)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <h3 className="truncate text-sm font-medium text-zinc-100">
                              {p.name}
                            </h3>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {p.assetCount} photos
                            </p>
                          </button>
                        </CardHover>
                      </StaggerItem>
                    ))}
                  </StaggerGrid>
                </section>
              )}

              {unrequestedPeople.length > 0 && (
                <section>
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                    Request Access
                  </h2>
                  <StaggerGrid className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {unrequestedPeople.map((p) => (
                      <PersonCard
                        key={p.id}
                        person={p}
                        onRequest={(id, name) =>
                          setModalPerson({ id, name })
                        }
                      />
                    ))}
                  </StaggerGrid>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <Modal
        open={modalPerson !== null}
        onClose={() => setModalPerson(null)}
        title="Request Access"
        confirmLabel="Send Request"
        onConfirm={() => {
          if (modalPerson) requestMutation.mutate(modalPerson.id);
        }}
      >
        <p>
          Request access to see photos of{" "}
          <span className="font-medium text-zinc-200">
            {modalPerson?.name}
          </span>
          ? An admin will review your request.
        </p>
      </Modal>
    </PageTransition>
  );
}
