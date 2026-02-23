import { BookOpenIcon, BookmarkIcon, BrainCircuitIcon, MessageSquareIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProjectDashboard } from "@/lib/api";

interface SectionCardsProps {
  dashboard: ProjectDashboard;
}

export function SectionCards({ dashboard }: SectionCardsProps) {
  const items = [
    {
      title: "Papers",
      value: dashboard.stats.papers,
      description: `${dashboard.stats.openAccess} with open access`,
      icon: BookOpenIcon,
    },
    {
      title: "Reading List",
      value: dashboard.stats.readingList,
      description: `${dashboard.stats.bookmarked} bookmarked`,
      icon: BookmarkIcon,
    },
    {
      title: "Chats",
      value: dashboard.stats.chats,
      description: `${dashboard.stats.memoryDocs} memory docs`,
      icon: MessageSquareIcon,
    },
    {
      title: "Latest Run",
      value: dashboard.latestRun?.status ?? "NONE",
      description: dashboard.latestRun
        ? `Updated ${new Date(dashboard.latestRun.updatedAt).toLocaleString()}`
        : "No run yet",
      icon: BrainCircuitIcon,
    },
  ];

  return (
    <div className="@xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-3 px-3 md:px-4 lg:px-5">
      {items.map((item) => (
        <Card key={item.title} className="@container/card">
          <CardHeader className="space-y-1 pb-1">
            <CardDescription className="flex items-center justify-between gap-2">
              <span>{item.title}</span>
              <item.icon className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-xl font-semibold tabular-nums">{item.value}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
