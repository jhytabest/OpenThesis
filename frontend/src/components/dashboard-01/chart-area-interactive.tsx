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
    { bucket: "Foundational", count: dashboard.stats.foundational },
    { bucket: "Depth", count: dashboard.stats.depth },
    { bucket: "Background", count: dashboard.stats.background },
    { bucket: "Open Access", count: dashboard.stats.openAccess },
  ];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Paper Distribution</CardTitle>
        <CardDescription>Current project coverage by tier and access</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
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
