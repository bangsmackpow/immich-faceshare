import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { AdminGuard, AdminShell } from "./layout";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";

interface RequestRow {
  id: string;
  status: string;
  createdAt: string;
  personName: string | null;
  requesterEmail: string | null;
  requesterName: string | null;
}

interface ApprovalRow {
  id: string;
  personName: string | null;
  userEmail: string | null;
  userName: string | null;
  grantedAt: string;
  revokedAt: string | null;
}

function RequestsPanel() {
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approved" | "denied">("approved");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "requests"],
    queryFn: () => api<{ data: RequestRow[] }>("/api/admin/requests"),
    refetchInterval: 15_000,
  });

  const review = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "denied";
    }) =>
      api(`/api/requests/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "approvals"] });
      setConfirmId(null);
    },
  });

  const pending = (data?.data ?? []).filter((r) => r.status === "pending");

  return (
    <Card title={`Pending Requests (${pending.length})`}>
      {isLoading ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          Loading...
        </div>
      ) : pending.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          No pending requests
        </div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100">
                  {r.personName ?? "Unknown"}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {r.requesterName ?? r.requesterEmail ?? "Unknown user"} &middot;{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="primary"
                  loading={review.isPending && confirmId === r.id && confirmAction === "approved"}
                  onClick={() => {
                    setConfirmId(r.id);
                    setConfirmAction("approved");
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  loading={review.isPending && confirmId === r.id && confirmAction === "denied"}
                  onClick={() => {
                    setConfirmId(r.id);
                    setConfirmAction("denied");
                  }}
                >
                  Deny
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title={confirmAction === "approved" ? "Approve access?" : "Deny access?"}
        confirmLabel={confirmAction === "approved" ? "Approve" : "Deny"}
        confirmVariant={confirmAction === "denied" ? "danger" : "primary"}
        onConfirm={() => {
          if (confirmId) {
            review.mutate({ id: confirmId, status: confirmAction });
          }
        }}
      >
        <p>
          {confirmAction === "approved"
            ? "The user will be notified and gain access to view photos."
            : "The user will be notified that their request was denied."}
        </p>
      </Modal>
    </Card>
  );
}

function ApprovalsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "approvals"],
    queryFn: () => api<{ data: ApprovalRow[] }>("/api/admin/approvals"),
    refetchInterval: 15_000,
  });

  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/approvals/${id}/revoke`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "approvals"] }),
  });

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const active = (data?.data ?? []).filter((a) => !a.revokedAt);

  return (
    <Card title={`Active Approvals (${active.length})`}>
      {isLoading ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
      ) : active.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          No active approvals
        </div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {active.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  {a.personName ?? "Unknown"}
                </p>
                <p className="text-xs text-zinc-500">
                  {a.userName ?? a.userEmail} &middot;{" "}
                  {new Date(a.grantedAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="danger"
                loading={revoke.isPending && revokeId === a.id}
                onClick={() => setRevokeId(a.id)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={revokeId !== null}
        onClose={() => setRevokeId(null)}
        title="Revoke access?"
        confirmLabel="Revoke"
        confirmVariant="danger"
        onConfirm={() => {
          if (revokeId) {
            revoke.mutate(revokeId);
            setRevokeId(null);
          }
        }}
      >
        <p>This user will immediately lose access to this person&apos;s photos.</p>
      </Modal>
    </Card>
  );
}

function RecentLogPanel() {
  const { data } = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () =>
      api<{ data: { action: string; createdAt: string; userEmail: string | null }[] }>(
        "/api/admin/audit-log?limit=10",
      ),
    refetchInterval: 10_000,
  });

  return (
    <Card title="Recent Activity">
      {!data?.data?.length ? (
        <div className="py-4 text-center text-sm text-zinc-500">No activity</div>
      ) : (
        <div className="space-y-2">
          {data.data.map((e, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <Badge variant="info">{e.action}</Badge>
              <span className="text-zinc-500">
                {new Date(e.createdAt).toLocaleString()}
              </span>
              {e.userEmail && (
                <span className="text-zinc-600">{e.userEmail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AdminDashboard() {
  return (
    <AdminGuard>
      <AdminShell>
        <div className="grid gap-6 lg:grid-cols-2">
          <RequestsPanel />
          <ApprovalsPanel />
          <div className="lg:col-span-2">
            <RecentLogPanel />
          </div>
        </div>
      </AdminShell>
    </AdminGuard>
  );
}
