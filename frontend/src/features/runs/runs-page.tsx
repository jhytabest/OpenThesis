import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, projectsApi, type ProjectRunListItem, type RunType } from "@/lib/api";

interface RunsPageProps {
  projectId: string;
}

export function RunsPage({ projectId }: RunsPageProps) {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [runType, setRunType] = useState<RunType>("RESEARCH");
  const [runs, setRuns] = useState<ProjectRunListItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectsApi.listRuns(projectId);
      setRuns(response.runs);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load runs";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestRun = useMemo(() => runs[0] ?? null, [runs]);

  const handleStartRun = async () => {
    setStarting(true);
    try {
      const response = await projectsApi.createRun(projectId, {
        runType,
        snapshotPolicy: "LATEST_FROZEN",
      });
      toast.success(`Run started: ${response.run.id.slice(0, 8)}`);
      await load();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to start run";
      toast.error(message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid gap-3 px-3 py-3 md:px-4 lg:px-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Start Run</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={runType} onValueChange={(value) => setRunType(value as RunType)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Run type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RESEARCH">Research</SelectItem>
              <SelectItem value="THESIS_ASSISTANT">Thesis assistant</SelectItem>
              <SelectItem value="DATASET_ANALYSIS">Dataset analysis</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void handleStartRun()} disabled={starting}>
            {starting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            Start run
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Run History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading run history..."
              : `${runs.length} runs. Latest: ${latestRun ? `${latestRun.runType} / ${latestRun.status} / ${latestRun.contextStatus}` : "none"}`}
          </p>
          {runs.map((run) => (
            <div key={run.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{run.id}</p>
              <p className="text-muted-foreground">
                {run.runType} · {run.status} · context {run.contextStatus}
              </p>
              <p className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
