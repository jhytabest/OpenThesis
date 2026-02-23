import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import type { ProjectChat, ProjectSummary, ViewKey } from "../types";
import { formatDate, projectStatusLabel, projectTitle } from "../workspace-utils";

interface ProjectSidebarProps {
  projects: ProjectSummary[];
  chatsByProject: Record<string, ProjectChat[]>;
  activeProjectId: string | null;
  activeView: ViewKey;
  activeChatId: string | null;
  userEmail: string | null | undefined;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectView: (view: "dashboard" | "explorer" | "reading") => void;
  onSelectChat: (chatId: string) => void;
  onOpenCreateChat: (projectId: string) => void;
  onLogout: () => void;
}

export function ProjectSidebar({
  projects,
  chatsByProject,
  activeProjectId,
  activeView,
  activeChatId,
  userEmail,
  onCreateProject,
  onSelectProject,
  onSelectView,
  onSelectChat,
  onOpenCreateChat,
  onLogout
}: ProjectSidebarProps) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle>Projects</CardTitle>
        <Button size="sm" onClick={onCreateProject}>
          New project
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects yet. Create one to start your workspace.</p> : null}

        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const chats = chatsByProject[project.id] || [];

          return (
            <div className="space-y-3 rounded-md border p-3" key={project.id}>
              <div className="space-y-2">
                <Button size="sm" variant={isActive ? "secondary" : "ghost"} onClick={() => onSelectProject(project.id)}>
                  {projectTitle(project)}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {projectStatusLabel(project)} · {project.counts.papers} papers
                  {project.latestRun?.updatedAt ? ` · ${formatDate(project.latestRun.updatedAt)}` : ""}
                </p>
                {isActive ? <Badge>Active</Badge> : null}
              </div>

              {isActive ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={activeView === "dashboard" ? "secondary" : "ghost"}
                      onClick={() => onSelectView("dashboard")}
                    >
                      Dashboard
                    </Button>
                    <Button
                      size="sm"
                      variant={activeView === "explorer" ? "secondary" : "ghost"}
                      onClick={() => onSelectView("explorer")}
                    >
                      Paper explorer
                    </Button>
                    <Button
                      size="sm"
                      variant={activeView === "reading" ? "secondary" : "ghost"}
                      onClick={() => onSelectView("reading")}
                    >
                      Reading list
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    {chats.length === 0 ? <p className="text-xs text-muted-foreground">No chats yet.</p> : null}
                    {chats.map((chat) => (
                      <div key={chat.id}>
                        <Button
                          size="sm"
                          variant={activeView === "chat" && activeChatId === chat.id ? "secondary" : "ghost"}
                          onClick={() => onSelectChat(chat.id)}
                        >
                          {chat.title}
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => onOpenCreateChat(project.id)}>
                      New chat
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        <Separator />

        <div className="space-y-2">
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          <Button size="sm" variant="ghost" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
