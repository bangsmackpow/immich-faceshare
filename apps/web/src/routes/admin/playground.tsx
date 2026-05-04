import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AdminGuard, AdminShell } from "./layout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";

interface PlaygroundResult {
  status: number;
  statusText: string;
  elapsed: number;
  headers: Record<string, string>;
  body: unknown;
}

export default function AdminPlayground() {
  const [endpoint, setEndpoint] = useState("/api/server-info/ping");

  const { data: endpoints } = useQuery({
    queryKey: ["admin", "playground", "endpoints"],
    queryFn: () => api<{ data: string[] }>("/api/admin/playground/endpoints"),
  });

  const execute = useMutation({
    mutationFn: (ep: string) =>
      api<{ data: PlaygroundResult }>("/api/admin/playground/execute", {
        method: "POST",
        body: JSON.stringify({ endpoint: ep }),
      }),
  });

  const result = execute.data?.data;

  return (
    <AdminGuard>
      <AdminShell>
        <Card title="API Playground">
          <div className="mb-4 flex items-end gap-3">
            <div className="flex-1">
              <Select
                label="Immich Endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                options={
                  endpoints?.data?.map((ep) => ({ value: ep, label: ep })) ?? []
                }
              />
            </div>
            <Button
              loading={execute.isPending}
              onClick={() => execute.mutate(endpoint)}
            >
              Send
            </Button>
          </div>

          {execute.isError && (
            <div className="rounded-md border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">
              {(execute.error as Error).message}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-zinc-400">Status:</span>
                <Badge
                  variant={
                    result.status < 300
                      ? "success"
                      : result.status < 500
                        ? "warning"
                        : "danger"
                  }
                >
                  {result.status} {result.statusText}
                </Badge>
                <span className="text-zinc-500">{result.elapsed}ms</span>
              </div>

              <div>
                <h4 className="mb-1 text-xs font-medium text-zinc-500">
                  Response Headers
                </h4>
                <pre className="max-h-32 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-400">
                  {JSON.stringify(result.headers, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="mb-1 text-xs font-medium text-zinc-500">
                  Response Body
                </h4>
                <pre className="max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-300">
                  {JSON.stringify(result.body, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </Card>
      </AdminShell>
    </AdminGuard>
  );
}
