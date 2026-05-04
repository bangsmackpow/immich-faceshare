import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { AdminGuard, AdminShell } from "./layout";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

type LogEntry = Record<string, unknown> & {
  level?: number;
  time?: number;
  msg?: string;
  message?: string;
};

const LEVEL_LABEL: Record<number, { label: string; variant: "info" | "warning" | "danger" }> = {
  10: { label: "TRACE", variant: "info" },
  20: { label: "DEBUG", variant: "info" },
  30: { label: "INFO", variant: "info" },
  40: { label: "WARN", variant: "warning" },
  50: { label: "ERROR", variant: "danger" },
  60: { label: "FATAL", variant: "danger" },
};

const LEVEL_OPTIONS = [
  { value: "", label: "All levels" },
  { value: "50", label: "Error" },
  { value: "40", label: "Warn" },
  { value: "30", label: "Info" },
  { value: "20", label: "Debug" },
];

export default function AdminLogs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({ lines: "500" });
      if (level) params.set("level", level);
      if (search) params.set("q", search);
      const res = await api<{ data: LogEntry[]; total: number }>(
        `/api/admin/logs?${params}`,
      );
      setEntries(res.data);
      setTotal(res.total);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [level, search]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <AdminGuard>
      <AdminShell>
        <Card
          title={
            <div className="flex items-center justify-between">
              <span>Server Logs</span>
              <span className="text-xs font-normal text-zinc-500">
                {total} total &middot; showing last {entries.length}
              </span>
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="w-32">
              <Select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                options={LEVEL_OPTIONS}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={fetchLogs}>
              Refresh
            </Button>
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
            {loading ? (
              <div className="py-8 text-center text-zinc-500">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">No log entries</div>
            ) : (
              entries.map((e, i) => {
                const levelInfo = LEVEL_LABEL[e.level ?? 30];
                return (
                  <div
                    key={i}
                    className="flex gap-3 py-0.5 hover:bg-zinc-900"
                  >
                    <span className="shrink-0 text-zinc-700">
                      {e.time
                        ? new Date(e.time).toISOString().slice(11, 23)
                        : "---"}
                    </span>
                    <Badge variant={levelInfo?.variant ?? "default"}>
                      {levelInfo?.label ?? "???"}
                    </Badge>
                    <span className="text-zinc-300">
                      {e.msg ?? e.message ?? JSON.stringify(e)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </Card>
      </AdminShell>
    </AdminGuard>
  );
}
