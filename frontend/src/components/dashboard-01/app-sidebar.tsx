import {
  BookOpenIcon,
  BrainCircuitIcon,
  FolderIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  PlusCircleIcon,
} from "lucide-react";

import { NavUser } from "@/components/dashboard-01/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ProjectListItem, SessionUser } from "@/lib/api";
import { buildProjectPath, type ProjectSection } from "@/app/router";

interface AppSidebarProps extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  user: SessionUser;
  projects: ProjectListItem[];
  currentProjectId?: string;
  currentSection?: ProjectSection;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export function AppSidebar({
  user,
  projects,
  currentProjectId,
  currentSection,
  onNavigate,
  onLogout,
  ...props
}: AppSidebarProps) {
  const sections: Array<{ key: ProjectSection; title: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "dashboard", title: "Dashboard", icon: LayoutDashboardIcon },
    { key: "papers", title: "Papers", icon: BookOpenIcon },
    { key: "chats", title: "Chats", icon: MessageSquareIcon },
    { key: "memory", title: "Memory", icon: BrainCircuitIcon },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => onNavigate("/projects")}
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <FolderIcon className="h-5 w-5" />
              <span className="text-base font-semibold">Alexclaw</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {currentProjectId ? (
          <SidebarGroup>
            <SidebarGroupLabel>Sections</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={currentSection === item.key}
                      onClick={() => onNavigate(buildProjectPath(currentProjectId, item.key))}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate("/projects")}>
                  <PlusCircleIcon />
                  <span>New Project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    isActive={project.id === currentProjectId}
                    tooltip={project.title || "Untitled"}
                    onClick={() => onNavigate(buildProjectPath(project.id, "dashboard"))}
                  >
                    <FolderIcon />
                    <span>{project.title || "Untitled project"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  );
}
