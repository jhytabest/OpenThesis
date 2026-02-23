import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Toaster, toast } from "sonner";

import { AppShell } from "@/app/app-shell";
import {
  SITE_PAGE_META,
  buildProjectPath,
  buildSitePath,
  navigate,
  parseRoute,
  routeRequiresAuth,
  subscribeNavigation,
  type SitePageKey,
} from "@/app/router";
import { Login01Page } from "@/components/login-01-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApiError,
  authApi,
  projectsApi,
  type ProjectListItem,
  type SessionUser,
} from "@/lib/api";

const ProjectsPage = lazy(async () => {
  const module = await import("@/features/projects/projects-page");
  return { default: module.ProjectsPage };
});
const DashboardPage = lazy(async () => {
  const module = await import("@/features/dashboard/dashboard-page");
  return { default: module.DashboardPage };
});
const PapersPage = lazy(async () => {
  const module = await import("@/features/papers/papers-page");
  return { default: module.PapersPage };
});
const ChatsPage = lazy(async () => {
  const module = await import("@/features/chats/chats-page");
  return { default: module.ChatsPage };
});
const MemoryPage = lazy(async () => {
  const module = await import("@/features/memory/memory-page");
  return { default: module.MemoryPage };
});
const SitePages = lazy(async () => {
  const module = await import("@/features/site/site-pages");
  return { default: module.SitePages };
});

const RouteLoading = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2Icon className="size-5 animate-spin" />
  </div>
);

const PUBLIC_NAV_LINKS: Array<{ label: string; page: SitePageKey }> = [
  { label: "About", page: "about" },
  { label: "Pricing", page: "pricing" },
  { label: "Help", page: "help" },
  { label: "Support", page: "support" },
  { label: "Status", page: "status" },
];

const LEGAL_NAV_LINKS: Array<{ label: string; page: SitePageKey }> = [
  { label: "Privacy", page: "privacy" },
  { label: "Terms", page: "terms" },
  { label: "Cookies", page: "cookies" },
  { label: "Subprocessors", page: "subprocessors" },
  { label: "Compliance", page: "compliance" },
];

function PublicShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 md:px-4">
          <Button variant="ghost" className="h-8 px-2 font-semibold" onClick={() => navigate(buildSitePath("about"))}>
            Alexclaw
          </Button>
          <div className="flex flex-wrap items-center gap-1">
            {PUBLIC_NAV_LINKS.map((link) => (
              <Button
                key={link.page}
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => navigate(buildSitePath(link.page))}
              >
                {link.label}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => navigate(user ? "/projects" : "/login")}
          >
            {user ? "Open workspace" : "Sign in"}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl">{children}</main>
      <footer className="mx-auto max-w-6xl px-3 pb-4 pt-2 md:px-4">
        <div className="flex flex-wrap gap-1">
          {LEGAL_NAV_LINKS.map((link) => (
            <Button
              key={link.page}
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => navigate(buildSitePath(link.page))}
            >
              {link.label}
            </Button>
          ))}
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const route = useMemo(() => parseRoute(pathname), [pathname]);

  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    return subscribeNavigation(() => {
      setPathname(window.location.pathname);
    });
  }, []);

  const loadSession = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(undefined);
    try {
      const response = await authApi.me();
      setUser(response.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      } else {
        const message = error instanceof ApiError ? error.message : "Failed to load session";
        setAuthError(message);
        setUser(null);
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    try {
      const response = await projectsApi.list();
      setProjects(response.projects);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load projects";
      toast.error(message);
    } finally {
      setProjectsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (user) {
      void loadProjects();
    }
  }, [user, loadProjects]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user && routeRequiresAuth(route)) {
      navigate("/login", true);
    }
  }, [authLoading, route, user]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    if (route.page === "login" || route.page === "home") {
      navigate("/projects", true);
    }
  }, [authLoading, route.page, user]);

  const handleCreateProject = async (input: { title?: string; thesisText: string }) => {
    setCreatingProject(true);
    try {
      const response = await projectsApi.create(input);
      toast.success("Project created");
      await loadProjects();
      navigate(buildProjectPath(response.project.id, "dashboard"));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to create project";
      toast.error(message);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // best effort logout
    } finally {
      setUser(null);
      setProjects([]);
      navigate("/login", true);
      toast.success("Logged out");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  if (!user && route.page === "login") {
    return (
      <>
        <Login01Page errorMessage={authError} />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  if (!user && routeRequiresAuth(route)) {
    return <RouteLoading />;
  }

  if (user && (route.page === "login" || route.page === "home")) {
    return <RouteLoading />;
  }

  const publicContent = (() => {
    if (route.page === "home") {
      return <SitePages page="about" user={user} onNavigate={(path) => navigate(path)} />;
    }
    if (route.page === "site") {
      return <SitePages page={route.site} user={user} onNavigate={(path) => navigate(path)} />;
    }
    return (
      <div className="px-3 py-3 md:px-4">
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">This page does not exist.</p>
            <Button size="sm" onClick={() => navigate(buildSitePath("about"))}>Back to about</Button>
          </CardContent>
        </Card>
      </div>
    );
  })();

  if (!user) {
    return (
      <>
        <PublicShell user={user}>{publicContent}</PublicShell>
        <Toaster richColors position="top-right" />
      </>
    );
  }

  const header =
    route.page === "projects"
      ? {
          title: "Projects",
          subtitle: "Create and manage thesis analysis projects",
        }
      : route.page === "project"
        ? {
            title:
              projects.find((project) => project.id === route.projectId)?.title ||
              "Untitled project",
            subtitle: `Project ${route.projectId.slice(0, 8)}`,
          }
      : route.page === "site"
        ? {
            title: SITE_PAGE_META[route.site].title,
            subtitle: SITE_PAGE_META[route.site].subtitle,
          }
      : {
            title: "Not found",
          };

  const content = (() => {
    if (route.page === "projects") {
      return (
        <ProjectsPage
          projects={projects}
          loading={projectsLoading}
          creating={creatingProject}
          onCreateProject={handleCreateProject}
          onOpenProject={(projectId) => navigate(buildProjectPath(projectId, "dashboard"))}
        />
      );
    }

    if (route.page === "project") {
      if (route.section === "dashboard") {
        return <DashboardPage projectId={route.projectId} />;
      }
      if (route.section === "papers") {
        return <PapersPage projectId={route.projectId} />;
      }
      if (route.section === "chats") {
        return (
          <ChatsPage
            projectId={route.projectId}
            routeChatId={route.chatId}
            onOpenChat={(chatId) => navigate(buildProjectPath(route.projectId, "chats", chatId))}
          />
        );
      }
      if (route.section === "memory") {
        return <MemoryPage projectId={route.projectId} />;
      }
    }

    if (route.page === "site") {
      return <SitePages page={route.site} user={user} onNavigate={(path) => navigate(path)} />;
    }

    return (
      <div className="p-4 lg:p-6">
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">This page does not exist.</p>
            <Button onClick={() => navigate("/projects")}>Back to projects</Button>
          </CardContent>
        </Card>
      </div>
    );
  })();

  return (
    <>
      <AppShell
        user={user}
        projects={projects}
        currentProjectId={route.page === "project" ? route.projectId : undefined}
        currentSection={route.page === "project" ? route.section : undefined}
        currentSitePage={route.page === "site" ? route.site : undefined}
        title={header.title}
        subtitle={header.subtitle}
        onNavigate={(path) => navigate(path)}
        onLogout={() => void handleLogout()}
      >
        <Suspense fallback={<RouteLoading />}>{content}</Suspense>
      </AppShell>
      <Toaster richColors position="top-right" />
    </>
  );
}
