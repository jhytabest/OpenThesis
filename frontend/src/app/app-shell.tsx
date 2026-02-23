import { AppSidebar } from "@/components/dashboard-01/app-sidebar";
import { SiteHeader } from "@/components/dashboard-01/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { ProjectListItem, SessionUser } from "@/lib/api";
import type { ProjectSection, SitePageKey } from "@/app/router";

interface AppShellProps {
  user: SessionUser;
  projects: ProjectListItem[];
  currentProjectId?: string;
  currentSection?: ProjectSection;
  currentSitePage?: SitePageKey;
  title: string;
  subtitle?: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AppShell({
  user,
  projects,
  currentProjectId,
  currentSection,
  currentSitePage,
  title,
  subtitle,
  onNavigate,
  onLogout,
  children,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar
        variant="inset"
        user={user}
        projects={projects}
        currentProjectId={currentProjectId}
        currentSection={currentSection}
        currentSitePage={currentSitePage}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <SidebarInset>
        <SiteHeader title={title} subtitle={subtitle} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
