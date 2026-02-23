import { Button, Tile } from "@carbon/react";

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
    <Tile className="sidebar-panel">
      <div className="sidebar-header">
        <h2 className="cds--type-productive-heading-03">Projects</h2>
        <Button kind="primary" size="sm" onClick={onCreateProject}>
          New project
        </Button>
      </div>

      <div className="sidebar-scroll">
        {projects.length === 0 ? (
          <p className="empty-note cds--type-body-01">No projects yet. Create one to start your workspace.</p>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const chats = chatsByProject[project.id] || [];
            return (
              <Tile key={project.id} className={`project-tile${isActive ? " active" : ""}`}>
                <div className="project-row">
                  <Button
                    kind={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="sidebar-button"
                    onClick={() => onSelectProject(project.id)}
                  >
                    {projectTitle(project)}
                  </Button>
                  <p className="project-meta cds--type-body-compact-01">
                    {projectStatusLabel(project)} · {project.counts.papers} papers
                    {project.latestRun?.updatedAt ? ` · ${formatDate(project.latestRun.updatedAt)}` : ""}
                  </p>
                </div>

                {isActive ? (
                  <>
                    <div className="subnav-row">
                      <Button
                        kind={activeView === "dashboard" ? "secondary" : "ghost"}
                        size="sm"
                        className="sidebar-button"
                        onClick={() => onSelectView("dashboard")}
                      >
                        Dashboard
                      </Button>
                      <Button
                        kind={activeView === "explorer" ? "secondary" : "ghost"}
                        size="sm"
                        className="sidebar-button"
                        onClick={() => onSelectView("explorer")}
                      >
                        Paper explorer
                      </Button>
                      <Button
                        kind={activeView === "reading" ? "secondary" : "ghost"}
                        size="sm"
                        className="sidebar-button"
                        onClick={() => onSelectView("reading")}
                      >
                        Reading list
                      </Button>
                    </div>

                    <div className="chat-nav">
                      {chats.length === 0 ? (
                        <p className="empty-note cds--type-body-compact-01">No chats yet.</p>
                      ) : (
                        chats.map((chat) => (
                          <Button
                            key={chat.id}
                            kind={activeView === "chat" && activeChatId === chat.id ? "secondary" : "ghost"}
                            size="sm"
                            className="sidebar-button"
                            onClick={() => onSelectChat(chat.id)}
                          >
                            {chat.title}
                          </Button>
                        ))
                      )}

                      <Button kind="tertiary" size="sm" className="sidebar-button" onClick={() => onOpenCreateChat(project.id)}>
                        New chat
                      </Button>
                    </div>
                  </>
                ) : null}
              </Tile>
            );
          })
        )}
      </div>

      <div className="user-box">
        <p className="user-email cds--type-body-compact-01">{userEmail}</p>
        <Button kind="ghost" size="sm" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </Tile>
  );
}
