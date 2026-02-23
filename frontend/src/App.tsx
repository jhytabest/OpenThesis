import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Toaster, toast } from "sonner";

import { AppShell } from "@/app/app-shell";
import { buildProjectPath, navigate, parseRoute, subscribeNavigation } from "@/app/router";
import { Login01Page } from "@/components/login-01-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ChatsPage } from "@/features/chats/chats-page";
import { MemoryPage } from "@/features/memory/memory-page";
import { PapersPage } from "@/features/papers/papers-page";
import { ProjectsPage } from "@/features/projects/projects-page";
import {
  ApiError,
  authApi,
  projectsApi,
  type ProjectListItem,
  type SessionUser,
} from "@/lib/api";

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

  if (!user) {
    if (route.page !== "login") {
      navigate("/login", true);
    }
    return (
      <>
        <Login01Page errorMessage={authError} />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  if (route.page === "login") {
    navigate("/projects", true);
    return null;
  }

  if (route.page === "home") {
    navigate("/projects", true);
    return null;
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
        title={header.title}
        subtitle={header.subtitle}
        onNavigate={(path) => navigate(path)}
        onLogout={() => void handleLogout()}
      >
        {content}
      </AppShell>
      <Toaster richColors position="top-right" />
    </>
  );
}
