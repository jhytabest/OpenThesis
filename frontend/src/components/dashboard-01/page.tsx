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
        <div className="flex flex-col gap-3 py-3">
          <SectionCards dashboard={dashboard} />

          <div className="px-3 md:px-4 lg:px-5">
            <ChartAreaInteractive dashboard={dashboard} />
          </div>

          <div className="grid gap-3 px-3 md:px-4 lg:grid-cols-2 lg:px-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Thesis Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {dashboard.summary.thesisSummary || "No thesis summary available yet. Run the pipeline to generate one."}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Progress Log</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 overflow-auto whitespace-pre-wrap pt-0 text-sm text-muted-foreground">
                {dashboard.summary.progressLog || "No progress log entries yet."}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
