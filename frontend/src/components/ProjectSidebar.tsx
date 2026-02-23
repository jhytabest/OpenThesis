import { Button, Stack, Tag, Tile } from "@carbon/react";

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
    <Tile>
      <Stack gap={6}>
        <Stack gap={4}>
          <h2 className="cds--type-productive-heading-03">Projects</h2>
          <div>
            <Button kind="primary" size="sm" onClick={onCreateProject}>
              New project
            </Button>
          </div>
        </Stack>

        <Stack gap={4}>
          {projects.length === 0 ? (
            <p className="cds--type-body-01">No projects yet. Create one to start your workspace.</p>
          ) : (
            projects.map((project) => {
              const isActive = project.id === activeProjectId;
              const chats = chatsByProject[project.id] || [];
              return (
                <Tile key={project.id}>
                  <Stack gap={4}>
                    <Stack gap={3}>
                      <div>
                        <Button kind={isActive ? "secondary" : "ghost"} size="sm" onClick={() => onSelectProject(project.id)}>
                          {projectTitle(project)}
                        </Button>
                      </div>
                      <p className="cds--type-body-compact-01">
                        {projectStatusLabel(project)} · {project.counts.papers} papers
                        {project.latestRun?.updatedAt ? ` · ${formatDate(project.latestRun.updatedAt)}` : ""}
                      </p>
                      {isActive ? <Tag type="red">Active</Tag> : null}
                    </Stack>

                    {isActive ? (
                      <Stack gap={3}>
                        <Stack gap={2}>
                          <div>
                            <Button kind={activeView === "dashboard" ? "secondary" : "ghost"} size="sm" onClick={() => onSelectView("dashboard")}>
                              Dashboard
                            </Button>
                          </div>
                          <div>
                            <Button kind={activeView === "explorer" ? "secondary" : "ghost"} size="sm" onClick={() => onSelectView("explorer")}>
                              Paper explorer
                            </Button>
                          </div>
                          <div>
                            <Button kind={activeView === "reading" ? "secondary" : "ghost"} size="sm" onClick={() => onSelectView("reading")}>
                              Reading list
                            </Button>
                          </div>
                        </Stack>

                        <Stack gap={2}>
                          {chats.length === 0 ? (
                            <p className="cds--type-body-compact-01">No chats yet.</p>
                          ) : (
                            chats.map((chat) => (
                              <div key={chat.id}>
                                <Button
                                  kind={activeView === "chat" && activeChatId === chat.id ? "secondary" : "ghost"}
                                  size="sm"
                                  onClick={() => onSelectChat(chat.id)}
                                >
                                  {chat.title}
                                </Button>
                              </div>
                            ))
                          )}
                          <div>
                            <Button kind="tertiary" size="sm" onClick={() => onOpenCreateChat(project.id)}>
                              New chat
                            </Button>
                          </div>
                        </Stack>
                      </Stack>
                    ) : null}
                  </Stack>
                </Tile>
              );
            })
          )}
        </Stack>

        <Stack gap={3}>
          <p className="cds--type-body-compact-01">{userEmail}</p>
          <div>
            <Button kind="ghost" size="sm" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </Stack>
      </Stack>
    </Tile>
  );
}
