import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, projectsApi } from "@/lib/api";

interface AuditPageProps {
  projectId: string;
}

export function AuditPage({ projectId }: AuditPageProps) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Array<{
    id: string;
    eventType: string;
    createdAt: string;
  }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const runResponse = await projectsApi.listRuns(projectId);
      const latest = runResponse.runs[0];
      if (!latest) {
        setEvents([]);
        return;
      }
      const auditResponse = await projectsApi.getRunAudit(projectId, latest.id);
      setEvents(
        auditResponse.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          createdAt: event.createdAt,
        }))
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load audit events";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-3 px-3 py-3 md:px-4 lg:px-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Audit Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loading ? <p className="text-muted-foreground">Loading audit events...</p> : null}
          {!loading && events.length === 0 ? (
            <p className="text-muted-foreground">No audit events yet. Start a run first.</p>
          ) : null}
          {events.map((event) => (
            <div key={event.id} className="rounded-md border p-3">
              <p className="font-medium">{event.eventType}</p>
              <p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
