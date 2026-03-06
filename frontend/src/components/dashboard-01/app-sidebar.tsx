import {
  ActivityIcon,
  BookOpenIcon,
  BrainCircuitIcon,
  Building2Icon,
  CookieIcon,
  CreditCardIcon,
  DatabaseIcon,
  DollarSignIcon,
  FileTextIcon,
  FolderIcon,
  HelpCircleIcon,
  InfoIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  OrbitIcon,
  PlusCircleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
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
import { buildProjectPath, buildSitePath, type ProjectSection, type SitePageKey } from "@/app/router";

interface AppSidebarProps extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  user: SessionUser;
  projects: ProjectListItem[];
  currentProjectId?: string;
  currentSection?: ProjectSection;
  currentSitePage?: SitePageKey;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export function AppSidebar({
  user,
  projects,
  currentProjectId,
  currentSection,
  currentSitePage,
  onNavigate,
  onLogout,
  ...props
}: AppSidebarProps) {
  const sections: Array<{ key: ProjectSection; title: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "dashboard", title: "Dashboard", icon: LayoutDashboardIcon },
    { key: "documents", title: "Documents", icon: FileTextIcon },
    { key: "runs", title: "Runs", icon: OrbitIcon },
    { key: "workbench", title: "Workbench", icon: NotebookPenIcon },
    { key: "datasets", title: "Datasets", icon: DatabaseIcon },
    { key: "audit", title: "Audit", icon: ScrollTextIcon },
    { key: "papers", title: "Papers", icon: BookOpenIcon },
    { key: "chats", title: "Chats", icon: MessageSquareIcon },
    { key: "memory", title: "Memory", icon: BrainCircuitIcon },
  ];
  const accountPages: Array<{ key: SitePageKey; title: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "account", title: "Account", icon: SettingsIcon },
    { key: "security", title: "Security", icon: ShieldIcon },
    { key: "billing", title: "Billing", icon: CreditCardIcon },
    { key: "data_controls", title: "Data Controls", icon: DatabaseIcon },
  ];
  const companyPages: Array<{ key: SitePageKey; title: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "about", title: "About", icon: InfoIcon },
    { key: "pricing", title: "Pricing", icon: DollarSignIcon },
    { key: "help", title: "Help", icon: HelpCircleIcon },
    { key: "support", title: "Support", icon: LifeBuoyIcon },
    { key: "status", title: "Status", icon: ActivityIcon },
    { key: "changelog", title: "Changelog", icon: FileTextIcon },
  ];
  const legalPages: Array<{ key: SitePageKey; title: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "privacy", title: "Privacy", icon: FileTextIcon },
    { key: "terms", title: "Terms", icon: FileTextIcon },
    { key: "cookies", title: "Cookies", icon: CookieIcon },
    { key: "subprocessors", title: "Subprocessors", icon: Building2Icon },
    { key: "compliance", title: "Compliance", icon: ShieldCheckIcon },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              onClick={() => onNavigate("/projects")}
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <FolderIcon className="size-4" />
              <span className="text-sm font-semibold">Alexclaw</span>
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
                      size="sm"
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
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountPages.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={currentSitePage === item.key}
                    tooltip={item.title}
                    onClick={() => onNavigate(buildSitePath(item.key))}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm" onClick={() => onNavigate("/projects")}>
                  <PlusCircleIcon />
                  <span>New Project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    size="sm"
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

        <SidebarGroup>
          <SidebarGroupLabel>Company</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {companyPages.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={currentSitePage === item.key}
                    tooltip={item.title}
                    onClick={() => onNavigate(buildSitePath(item.key))}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Legal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {legalPages.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={currentSitePage === item.key}
                    tooltip={item.title}
                    onClick={() => onNavigate(buildSitePath(item.key))}
                  >
                    <item.icon />
                    <span>{item.title}</span>
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
