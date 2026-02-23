import { useCallback, useEffect, useState } from "react";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { toast } from "sonner";

import Dashboard01Page from "@/components/dashboard-01/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, type ProjectDashboard, projectsApi } from "@/lib/api";

interface DashboardPageProps {
  projectId: string;
}

export function DashboardPage({ projectId }: DashboardPageProps) {
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingRun, setStartingRun] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectsApi.dashboard(projectId);
      setDashboard(response.dashboard);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load dashboard";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleStartRun = async () => {
    setStartingRun(true);
    try {
      const response = await projectsApi.createRun(projectId);
      toast.success(`Run started: ${response.run.id.slice(0, 8)}`);
      await loadDashboard();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to start run";
      toast.error(message);
    } finally {
      setStartingRun(false);
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="px-4 py-4 lg:px-6">
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading dashboard...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="px-4 pt-4 lg:px-6">
        <Button onClick={handleStartRun} disabled={startingRun}>
          {startingRun ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          Start new run
        </Button>
      </div>
      <Dashboard01Page dashboard={dashboard} />
    </div>
  );
}
