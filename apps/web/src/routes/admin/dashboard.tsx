import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { AdminGuard, AdminShell } from "./layout";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { CheckCircle, XCircle, Database, HardDrive, Users, Clock, Download, RefreshCw, Server, ArrowDownUp, UserPlus, KeyRound, Trash2, Edit } from "lucide-react";

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
    queryFn: () => api<{ data: RequestRow[]; total: number }>("/api/admin/requests"),
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

function HealthStatusPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () =>
      api<{
        uptime: number;
        memory: { rss: number; heapUsed: number; heapTotal: number };
        database: { healthy: boolean; path: string; sizeBytes: number; latencyMs: number; error: string | null };
        immich: { healthy: boolean; version: string | null };
        stats: { users: number; people: number; pendingRequests: number; activeDownloads: number };
      }>("/api/admin/status"),
    refetchInterval: 30_000,
  });

  const sync = useMutation({
    mutationFn: () =>
      api<{ data: { synced: number; totalAssets: number } }>("/api/admin/sync", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "status"] });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
  });

  const status = data;
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <Card title="System Health">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">Uptime: {status ? formatUptime(status.uptime) : "..."}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => sync.mutate()} loading={sync.isPending}>
            <ArrowDownUp className="h-3 w-3 mr-1" /> Sync
          </Button>
          <Button variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Database */}
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Database</span>
            {status && (
              status.database.healthy
                ? <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
                : <XCircle className="h-4 w-4 text-red-500 ml-auto" />
            )}
          </div>
          {status && (
            <div className="space-y-1 text-xs text-zinc-500">
              <p>Latency: {status.database.latencyMs}ms</p>
              <p>Size: {formatBytes(status.database.sizeBytes)}</p>
              {status.database.error && (
                <p className="text-red-400">{status.database.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Immich */}
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Immich</span>
            {status && (
              status.immich.healthy
                ? <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
                : <XCircle className="h-4 w-4 text-red-500 ml-auto" />
            )}
          </div>
          {status && (
            <div className="space-y-1 text-xs text-zinc-500">
              <p>{status.immich.version ?? "unreachable"}</p>
            </div>
          )}
        </div>

        {/* Users */}
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Users</span>
          </div>
          {status && (
            <div className="space-y-1 text-xs text-zinc-500">
              <p>Total: {status.stats.users}</p>
              <p>Pending: {status.stats.pendingRequests}</p>
            </div>
          )}
        </div>

        {/* People & Downloads */}
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Content</span>
          </div>
          {status && (
            <div className="space-y-1 text-xs text-zinc-500">
              <p>People: {status.stats.people}</p>
              <p>Downloads: {status.stats.activeDownloads}</p>
            </div>
          )}
        </div>
      </div>

      {status && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">Memory: RSS {formatBytes(status.memory.rss)} / Heap {formatBytes(status.memory.heapUsed)} / {formatBytes(status.memory.heapTotal)}</p>
        </div>
      )}

      {isLoading && (
        <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
      )}
    </Card>
  );
}

function BackupPanel() {
  const qc = useQueryClient();
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "backups"],
    queryFn: () =>
      api<{ data: { name: string; size: number; createdAt: string }[] }>("/api/admin/backups"),
    refetchInterval: 30_000,
  });

  const createBackup = useMutation({
    mutationFn: () => api("/api/admin/backup", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "backups"] });
    },
  });

  const restoreBackup = useMutation({
    mutationFn: (backupFile: string) =>
      api("/api/admin/restore", {
        method: "POST",
        body: JSON.stringify({ backupFile }),
      }),
    onSuccess: () => {
      setShowRestoreModal(false);
      setRestoreFile(null);
      qc.invalidateQueries({ queryKey: ["admin", "backups"] });
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <Card title="Database Backups">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">{data?.data?.length ?? 0} backup(s)</p>
        <Button
          variant="primary"
          loading={createBackup.isPending}
          onClick={() => createBackup.mutate()}
        >
          <Download className="h-3 w-3 mr-1" /> Create Backup
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
      ) : !data?.data?.length ? (
        <div className="py-8 text-center text-sm text-zinc-500">No backups yet</div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {data.data.map((b) => (
            <div key={b.name} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-mono text-zinc-200 truncate">{b.name}</p>
                <p className="text-xs text-zinc-500">
                  {formatBytes(b.size)} &middot; {new Date(b.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setRestoreFile(b.name);
                  setShowRestoreModal(true);
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showRestoreModal}
        onClose={() => {
          setShowRestoreModal(false);
          setRestoreFile(null);
        }}
        title="Restore Database?"
        confirmLabel="Restore"
        confirmVariant="danger"
        onConfirm={() => {
          if (restoreFile) {
            restoreBackup.mutate(restoreFile);
          }
        }}
      >
        <p className="text-sm text-zinc-400">
          This will replace the current database with <span className="font-mono text-zinc-200">{restoreFile}</span>.
          The API server must be restarted for changes to take effect.
        </p>
      </Modal>
    </Card>
  );
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

function UserManagementPanel() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as "admin" | "user" });
  const [editForm, setEditForm] = useState({ name: "", role: "admin" as "admin" | "user" });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<{ data: UserRow[]; total: number }>("/api/admin/users"),
    refetchInterval: 30_000,
  });

  const createUser = useMutation({
    mutationFn: () =>
      api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "user" });
    },
    onError: (err) => {
      console.error("create user failed:", err);
      alert(err instanceof Error ? err.message : "Failed to create user");
    },
  });

  const updateUser = useMutation({
    mutationFn: () =>
      api(`/api/admin/users/${editUser!.id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setEditUser(null);
    },
  });

  const resetPassword = useMutation({
    mutationFn: () =>
      api<{ data: { password: string } }>(`/api/admin/users/${resetUser!.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (res) => {
      setNewPassword(res.data.password);
    },
  });

  const deleteUserMut = useMutation({
    mutationFn: () =>
      api(`/api/admin/users/${deleteUser!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setDeleteUser(null);
    },
  });

  return (
    <Card title={`User Management (${data?.total ?? 0})`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">Manage user accounts and permissions</p>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <UserPlus className="h-3 w-3 mr-1" /> Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
      ) : !data?.data?.length ? (
        <div className="py-8 text-center text-sm text-zinc-500">No users yet</div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {data.data.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100">{u.name}</p>
                <p className="truncate text-xs text-zinc-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={u.role === "admin" ? "danger" : "info"}>{u.role}</Badge>
                <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditUser(u); setEditForm({ name: u.name, role: u.role }); }}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => { setResetUser(u); setNewPassword(null); }}>
                  <KeyRound className="h-3 w-3" />
                </Button>
                <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteUser(u)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create User" confirmLabel="Create" confirmVariant="primary" onConfirm={() => createUser.mutate()}>
        <div className="space-y-3">
          <input className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Password (min 8 chars)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={editUser !== null} onClose={() => setEditUser(null)} title="Edit User" confirmLabel="Save" confirmVariant="primary" onConfirm={() => updateUser.mutate()}>
        <div className="space-y-3">
          <input className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as "admin" | "user" })}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={resetUser !== null} onClose={() => setResetUser(null)} title={`Reset Password: ${resetUser?.name}`} confirmLabel="Reset" confirmVariant="danger" onConfirm={() => resetPassword.mutate()}>
        {newPassword ? (
          <div className="rounded-md border border-emerald-800 bg-emerald-900/20 p-3">
            <p className="text-sm text-emerald-400">New password:</p>
            <p className="mt-1 font-mono text-lg text-emerald-200">{newPassword}</p>
            <p className="mt-2 text-xs text-emerald-500">Share this with the user securely.</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">This will generate a new random password for {resetUser?.name}.</p>
        )}
      </Modal>

      {/* Delete User Modal */}
      <Modal open={deleteUser !== null} onClose={() => setDeleteUser(null)} title="Delete User?" confirmLabel="Delete" confirmVariant="danger" onConfirm={() => deleteUserMut.mutate()}>
        <p className="text-sm text-zinc-400">This will permanently delete <span className="font-medium text-zinc-200">{deleteUser?.name}</span> ({deleteUser?.email}). This action cannot be undone.</p>
      </Modal>
    </Card>
  );
}

export default function AdminDashboard() {
  return (
    <AdminGuard>
      <AdminShell>
        <div className="grid gap-6 lg:grid-cols-2">
          <UserManagementPanel />
          <HealthStatusPanel />
          <BackupPanel />
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
