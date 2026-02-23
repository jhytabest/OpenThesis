import { ChartAreaInteractive } from "@/components/dashboard-01/chart-area-interactive";
import { SectionCards } from "@/components/dashboard-01/section-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectDashboard } from "@/lib/api";

interface Dashboard01PageProps {
  dashboard: ProjectDashboard;
}

export default function Dashboard01Page({ dashboard }: Dashboard01PageProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <SectionCards dashboard={dashboard} />

          <div className="px-4 lg:px-6">
            <ChartAreaInteractive dashboard={dashboard} />
          </div>

          <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Thesis Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {dashboard.summary.thesisSummary || "No thesis summary available yet. Run the pipeline to generate one."}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Progress Log</CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                {dashboard.summary.progressLog || "No progress log entries yet."}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
