import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ProjectDashboard } from "@/lib/api";

interface ChartAreaInteractiveProps {
  dashboard: ProjectDashboard;
}

const chartConfig = {
  count: {
    label: "Papers",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export function ChartAreaInteractive({ dashboard }: ChartAreaInteractiveProps) {
  const data = [
    { bucket: "Papers", count: dashboard.stats.papers },
    { bucket: "Open Access", count: dashboard.stats.openAccess },
    { bucket: "Reading", count: dashboard.stats.readingList },
    { bucket: "Bookmarked", count: dashboard.stats.bookmarked },
    { bucket: "Chats", count: dashboard.stats.chats },
    { bucket: "Memory Docs", count: dashboard.stats.memoryDocs },
  ];

  return (
    <Card className="@container/card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Project Activity</CardTitle>
        <CardDescription>Compact snapshot of paper and workspace metrics</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={6} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
