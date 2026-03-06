import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, projectsApi, type ProjectRunListItem } from "@/lib/api";

interface WorkbenchPageProps {
  projectId: string;
}

export function WorkbenchPage({ projectId }: WorkbenchPageProps) {
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<ProjectRunListItem | null>(null);
  const [artifacts, setArtifacts] = useState<Array<{
    id: string;
    artifactType: string;
    title: string;
    storageKey: string;
    createdAt: string;
  }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const runs = await projectsApi.listRuns(projectId);
      const latestAssistant = runs.runs.find((candidate) => candidate.runType === "THESIS_ASSISTANT") ?? null;
      setRun(latestAssistant);
      if (!latestAssistant) {
        setArtifacts([]);
        return;
      }
      const artifactResponse = await projectsApi.getRunArtifacts(projectId, latestAssistant.id);
      setArtifacts(
        artifactResponse.artifacts.map((artifact) => ({
          id: artifact.id,
          artifactType: artifact.artifactType,
          title: artifact.title,
          storageKey: artifact.storageKey,
          createdAt: artifact.createdAt,
        }))
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load workbench";
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
          <CardTitle className="text-base">Thesis Workbench</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loading ? <p className="text-muted-foreground">Loading workbench...</p> : null}
          {!loading && !run ? (
            <p className="text-muted-foreground">No thesis assistant run yet. Start one in Runs.</p>
          ) : null}
          {run ? (
            <>
              <p>
                Active run: <span className="font-medium">{run.id}</span> ({run.status}, {run.contextStatus})
              </p>
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-md border p-3">
                  <p className="font-medium">{artifact.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {artifact.artifactType} · {artifact.storageKey}
                  </p>
                </div>
              ))}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
