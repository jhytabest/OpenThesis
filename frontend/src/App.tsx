import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LogOut, MessageSquare, Plus, RotateCw } from "lucide-react";

import { ApiError, apiRequest } from "./api";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Separator } from "./components/ui/separator";
import type {
  ExplorerFilters,
  ManualPaperForm,
  ProjectChat,
  ProjectChatMessage,
  ProjectDashboard,
  ProjectMemoryDoc,
  ProjectPaper,
  ProjectPaperComment,
  ProjectSummary,
  ReadingDraft,
  SessionUser,
  ViewKey
} from "./types";
import { ChatView, DashboardView, ExplorerView, NewProjectView, ReadingView } from "./components/WorkspaceViews";
import { GuestLanding } from "./components/GuestLanding";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { decodeListInput, isProjectUpdating, projectTitle } from "./workspace-utils";

interface NotificationState {
  kind: "error" | "success" | "warning" | "info";
  title: string;
  subtitle?: string;
}

type AuthState = "loading" | "guest" | "authed";

type ChatModalState = {
  mode: "create" | "rename";
  projectId: string;
  chatId?: string;
  title: string;
};

type ConfirmAction =
  | {
      type: "delete-chat";
      projectId: string;
      chatId: string;
    }
  | {
      type: "delete-paper";
      projectId: string;
      paperId: string;
      sourceView: "explorer" | "reading";
    };

interface ConfirmModalState {
  heading: string;
  body: string;
  confirmLabel: string;
  action: ConfirmAction;
}

const DEFAULT_EXPLORER_FILTERS: ExplorerFilters = {
  query: "",
  sort: "relevance",
  tier: "",
  oaOnly: false,
  bookmarkedOnly: false
};

const DEFAULT_MANUAL_PAPER: ManualPaperForm = {
  title: "",
  doi: "",
  year: "",
  citationCount: "",
  fields: "",
  abstract: ""
};

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [chatsByProject, setChatsByProject] = useState<Record<string, ProjectChat[]>>({});
  const chatsByProjectRef = useRef<Record<string, ProjectChat[]>>({});

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("new-project");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [notification, setNotification] = useState<NotificationState | null>(null);

  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectThesis, setNewProjectThesis] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [memoryDocs, setMemoryDocs] = useState<ProjectMemoryDoc[]>([]);
  const [memoryDrafts, setMemoryDrafts] = useState<Record<string, { title: string; content: string }>>({});
  const [savingMemoryKey, setSavingMemoryKey] = useState<string | null>(null);

  const [explorerFilters, setExplorerFilters] = useState<ExplorerFilters>(DEFAULT_EXPLORER_FILTERS);
  const [explorerDraftFilters, setExplorerDraftFilters] = useState<ExplorerFilters>(DEFAULT_EXPLORER_FILTERS);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerPapers, setExplorerPapers] = useState<ProjectPaper[]>([]);
  const [paperComments, setPaperComments] = useState<Record<string, ProjectPaperComment[]>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [manualPaper, setManualPaper] = useState<ManualPaperForm>(DEFAULT_MANUAL_PAPER);
  const [addingPaper, setAddingPaper] = useState(false);
  const [updatingPaperId, setUpdatingPaperId] = useState<string | null>(null);

  const [readingLoading, setReadingLoading] = useState(false);
  const [readingPapers, setReadingPapers] = useState<ProjectPaper[]>([]);
  const [readingDrafts, setReadingDrafts] = useState<Record<string, ReadingDraft>>({});
  const [savingReadingPaperId, setSavingReadingPaperId] = useState<string | null>(null);

  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [chatModal, setChatModal] = useState<ChatModalState | null>(null);
  const [chatModalBusy, setChatModalBusy] = useState(false);

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [confirmModalBusy, setConfirmModalBusy] = useState(false);

  useEffect(() => {
    chatsByProjectRef.current = chatsByProject;
  }, [chatsByProject]);

  const clearWorkspaceState = useCallback(() => {
    setUser(null);
    setProjects([]);
    setChatsByProject({});
    setActiveProjectId(null);
    setActiveView("new-project");
    setActiveChatId(null);

    setDashboard(null);
    setMemoryDocs([]);
    setMemoryDrafts({});

    setExplorerPapers([]);
    setPaperComments({});
    setOpenComments({});
    setCommentDrafts({});
    setExplorerFilters(DEFAULT_EXPLORER_FILTERS);
    setExplorerDraftFilters(DEFAULT_EXPLORER_FILTERS);
    setManualPaper(DEFAULT_MANUAL_PAPER);

    setReadingPapers([]);
    setReadingDrafts({});

    setChatMessages([]);
    setChatInput("");
  }, []);

  const handleApiError = useCallback(
    (error: unknown, fallbackTitle: string) => {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          clearWorkspaceState();
          setAuthState("guest");
          setNotification({
            kind: "warning",
            title: "Session expired",
            subtitle: "Sign in again to continue."
          });
          return;
        }
        setNotification({ kind: "error", title: error.message || fallbackTitle });
        return;
      }

      const message = error instanceof Error ? error.message : fallbackTitle;
      setNotification({ kind: "error", title: message || fallbackTitle });
    },
    [clearWorkspaceState]
  );

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const payload = await apiRequest<{ projects: ProjectSummary[] }>("/api/projects");
      const nextProjects = payload.projects || [];
      setProjects(nextProjects);

      setActiveProjectId((prev) => {
        if (prev && nextProjects.some((project) => project.id === prev)) {
          return prev;
        }
        return nextProjects[0]?.id ?? null;
      });

      setActiveView((prev) => {
        if (nextProjects.length === 0) {
          return "new-project";
        }
        return prev === "new-project" ? "dashboard" : prev;
      });
    } catch (error) {
      handleApiError(error, "Unable to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, [handleApiError]);

  const ensureChats = useCallback(
    async (projectId: string, force = false): Promise<ProjectChat[]> => {
      if (!force && chatsByProjectRef.current[projectId]) {
        return chatsByProjectRef.current[projectId];
      }
      try {
        const payload = await apiRequest<{ chats: ProjectChat[] }>(`/api/projects/${projectId}/chats`);
        const chats = payload.chats || [];
        setChatsByProject((prev) => ({ ...prev, [projectId]: chats }));
        setActiveChatId((prev) => {
          if (!prev) {
            return prev;
          }
          return chats.some((chat) => chat.id === prev) ? prev : null;
        });
        return chats;
      } catch (error) {
        handleApiError(error, "Unable to load chats");
        return [];
      }
    },
    [handleApiError]
  );

  const refreshDashboard = useCallback(
    async (projectId: string) => {
      setDashboardLoading(true);
      try {
        const [dashboardPayload, memoryPayload] = await Promise.all([
          apiRequest<{ dashboard: ProjectDashboard }>(`/api/projects/${projectId}/dashboard`),
          apiRequest<{ memoryDocs: ProjectMemoryDoc[] }>(`/api/projects/${projectId}/memory-docs`)
        ]);

        const docs = memoryPayload.memoryDocs || [];
        setDashboard(dashboardPayload.dashboard);
        setMemoryDocs(docs);
        setMemoryDrafts(
          Object.fromEntries(
            docs.map((doc) => [
              doc.key,
              {
                title: doc.title,
                content: doc.content
              }
            ])
          )
        );
      } catch (error) {
        handleApiError(error, "Unable to load dashboard");
      } finally {
        setDashboardLoading(false);
      }
    },
    [handleApiError]
  );

  const refreshExplorer = useCallback(
    async (projectId: string, filters: ExplorerFilters) => {
      setExplorerLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.query) {
          params.set("query", filters.query);
        }
        if (filters.sort) {
          params.set("sort", filters.sort);
        }
        if (filters.tier) {
          params.set("tier", filters.tier);
        }
        if (filters.oaOnly) {
          params.set("oaOnly", "true");
        }
        if (filters.bookmarkedOnly) {
          params.set("bookmarkedOnly", "true");
        }

        const payload = await apiRequest<{ papers: ProjectPaper[] }>(
          `/api/projects/${projectId}/papers?${params.toString()}`
        );
        setExplorerPapers(payload.papers || []);
      } catch (error) {
        handleApiError(error, "Unable to load explorer papers");
      } finally {
        setExplorerLoading(false);
      }
    },
    [handleApiError]
  );

  const refreshReadingList = useCallback(
    async (projectId: string) => {
      setReadingLoading(true);
      try {
        const payload = await apiRequest<{ papers: ProjectPaper[] }>(`/api/projects/${projectId}/reading-list`);
        const papers = payload.papers || [];
        setReadingPapers(papers);
        setReadingDrafts(
          Object.fromEntries(
            papers.map((paper) => [
              paper.id,
              {
                tags: (paper.tags || []).join(", "),
                comment: paper.comment || paper.note || ""
              }
            ])
          )
        );
      } catch (error) {
        handleApiError(error, "Unable to load reading list");
      } finally {
        setReadingLoading(false);
      }
    },
    [handleApiError]
  );

  const refreshChatMessages = useCallback(
    async (projectId: string, chatId: string) => {
      setChatLoading(true);
      try {
        const payload = await apiRequest<{ messages: ProjectChatMessage[] }>(
          `/api/projects/${projectId}/chats/${chatId}/messages`
        );
        setChatMessages(payload.messages || []);
      } catch (error) {
        handleApiError(error, "Unable to load chat messages");
      } finally {
        setChatLoading(false);
      }
    },
    [handleApiError]
  );

  const fetchPaperComments = useCallback(
    async (projectId: string, paperId: string) => {
      const payload = await apiRequest<{ comments: ProjectPaperComment[] }>(
        `/api/projects/${projectId}/papers/${paperId}/comments`
      );
      setPaperComments((prev) => ({
        ...prev,
        [paperId]: payload.comments || []
      }));
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setAuthState("loading");
      try {
        const payload = await apiRequest<{ user: SessionUser }>("/api/auth/me");
        if (cancelled) {
          return;
        }
        setUser(payload.user);
        setAuthState("authed");
      } catch {
        if (cancelled) {
          return;
        }
        clearWorkspaceState();
        setAuthState("guest");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [clearWorkspaceState]);

  useEffect(() => {
    if (authState !== "authed") {
      return;
    }
    void loadProjects();
  }, [authState, loadProjects]);

  useEffect(() => {
    if (authState !== "authed" || !activeProjectId) {
      return;
    }
    void ensureChats(activeProjectId, false);
  }, [authState, activeProjectId, ensureChats]);

  useEffect(() => {
    if (authState !== "authed") {
      return;
    }
    const hasPending = projects.some((project) => isProjectUpdating(project));
    if (!hasPending) {
      return;
    }

    const timer = setInterval(() => {
      void loadProjects();
    }, 5000);

    return () => clearInterval(timer);
  }, [authState, projects, loadProjects]);

  useEffect(() => {
    if (authState !== "authed" || !activeProjectId) {
      return;
    }
    if (activeView === "dashboard") {
      void refreshDashboard(activeProjectId);
      return;
    }
    if (activeView === "explorer") {
      void refreshExplorer(activeProjectId, explorerFilters);
      return;
    }
    if (activeView === "reading") {
      void refreshReadingList(activeProjectId);
      return;
    }
    if (activeView === "chat") {
      const chats = chatsByProject[activeProjectId] || [];
      const selectedChatId = activeChatId || chats[0]?.id || null;
      if (!activeChatId && selectedChatId) {
        setActiveChatId(selectedChatId);
      }
      if (selectedChatId) {
        void refreshChatMessages(activeProjectId, selectedChatId);
      }
    }
  }, [
    authState,
    activeProjectId,
    activeView,
    activeChatId,
    explorerFilters,
    chatsByProject,
    refreshDashboard,
    refreshExplorer,
    refreshReadingList,
    refreshChatMessages
  ]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const activeProjectChats = useMemo(() => {
    if (!activeProjectId) {
      return [];
    }
    return chatsByProject[activeProjectId] || [];
  }, [activeProjectId, chatsByProject]);

  const activeChat = useMemo(
    () => activeProjectChats.find((chat) => chat.id === activeChatId) || null,
    [activeProjectChats, activeChatId]
  );

  const headerTitle = useMemo(() => {
    if (!activeProject || activeView === "new-project") {
      return "Create a Project";
    }
    if (activeView === "chat" && activeChat) {
      return activeChat.title;
    }
    return projectTitle(activeProject);
  }, [activeProject, activeView, activeChat]);

  const headerSubtitle = useMemo(() => {
    if (!activeProject || activeView === "new-project") {
      return "Every project starts from thesis text and triggers background research.";
    }
    if (activeView === "dashboard") {
      return "Project metrics, run status, and memory documents.";
    }
    if (activeView === "explorer") {
      return "Filter, annotate, and manage project papers.";
    }
    if (activeView === "reading") {
      return "Track notes and tags for your current reading queue.";
    }
    return "A focused workspace for project chat and synthesis.";
  }, [activeProject, activeView]);

  const openCreateChat = useCallback((projectId: string) => {
    setChatModal({ mode: "create", projectId, title: "" });
  }, []);

  const openRenameChat = useCallback((projectId: string, chat: ProjectChat) => {
    setChatModal({
      mode: "rename",
      projectId,
      chatId: chat.id,
      title: chat.title
    });
  }, []);

  const requestDeleteChat = useCallback((projectId: string, chatId: string) => {
    setConfirmModal({
      heading: "Delete chat",
      body: "This chat and all messages inside it will be removed.",
      confirmLabel: "Delete chat",
      action: {
        type: "delete-chat",
        projectId,
        chatId
      }
    });
  }, []);

  const requestDeletePaper = useCallback(
    (projectId: string, paperId: string, sourceView: "explorer" | "reading") => {
      setConfirmModal({
        heading: "Remove paper",
        body: "This removes the paper from the project workspace.",
        confirmLabel: "Remove paper",
        action: {
          type: "delete-paper",
          projectId,
          paperId,
          sourceView
        }
      });
    },
    []
  );

  const submitChatModal = useCallback(async () => {
    if (!chatModal) {
      return;
    }
    const title = chatModal.title.trim();

    setChatModalBusy(true);
    try {
      if (chatModal.mode === "create") {
        const payload = await apiRequest<{ chat: ProjectChat }>(`/api/projects/${chatModal.projectId}/chats`, {
          method: "POST",
          body: JSON.stringify({ title: title || undefined })
        });

        await ensureChats(chatModal.projectId, true);
        setActiveProjectId(chatModal.projectId);
        setActiveView("chat");
        setActiveChatId(payload.chat.id);
        setNotification({ kind: "success", title: "Chat created" });
      } else if (chatModal.chatId && title) {
        await apiRequest<{ ok: true }>(`/api/projects/${chatModal.projectId}/chats/${chatModal.chatId}`, {
          method: "PATCH",
          body: JSON.stringify({ title })
        });
        await ensureChats(chatModal.projectId, true);
        setNotification({ kind: "success", title: "Chat renamed" });
      }
      setChatModal(null);
    } catch (error) {
      handleApiError(error, "Unable to save chat");
    } finally {
      setChatModalBusy(false);
    }
  }, [chatModal, ensureChats, handleApiError]);

  const submitConfirmModal = useCallback(async () => {
    if (!confirmModal) {
      return;
    }

    setConfirmModalBusy(true);
    try {
      const action = confirmModal.action;
      if (action.type === "delete-chat") {
        await apiRequest<{ ok: true }>(`/api/projects/${action.projectId}/chats/${action.chatId}`, {
          method: "DELETE"
        });
        await ensureChats(action.projectId, true);
        if (activeChatId === action.chatId) {
          setActiveChatId(null);
        }
        setNotification({ kind: "success", title: "Chat deleted" });
      }

      if (action.type === "delete-paper") {
        await apiRequest<{ ok: true }>(`/api/projects/${action.projectId}/papers/${action.paperId}`, {
          method: "DELETE"
        });

        await loadProjects();
        if (action.sourceView === "explorer") {
          await refreshExplorer(action.projectId, explorerFilters);
        } else {
          await refreshReadingList(action.projectId);
        }
        setNotification({ kind: "success", title: "Paper removed" });
      }

      setConfirmModal(null);
    } catch (error) {
      handleApiError(error, "Unable to complete this action");
    } finally {
      setConfirmModalBusy(false);
    }
  }, [
    confirmModal,
    ensureChats,
    activeChatId,
    loadProjects,
    refreshExplorer,
    refreshReadingList,
    explorerFilters,
    handleApiError
  ]);

  const triggerRun = useCallback(
    async (projectId: string) => {
      try {
        await apiRequest<{ run: { id: string } }>(`/api/projects/${projectId}/runs`, { method: "POST" });
        await loadProjects();
        if (activeView === "dashboard") {
          await refreshDashboard(projectId);
        }
        setNotification({ kind: "success", title: "Background suggestions triggered" });
      } catch (error) {
        handleApiError(error, "Unable to trigger suggestions");
      }
    },
    [loadProjects, activeView, refreshDashboard, handleApiError]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
    } catch {
      // best effort logout
    }

    clearWorkspaceState();
    setAuthState("guest");
    setNotification({ kind: "info", title: "Logged out" });
  }, [clearWorkspaceState]);

  const submitNewProject = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const thesis = newProjectThesis.trim();
      if (thesis.length < 30) {
        setNotification({
          kind: "warning",
          title: "Thesis text is too short",
          subtitle: "Please provide at least 30 characters."
        });
        return;
      }

      setCreatingProject(true);
      try {
        const payload = await apiRequest<{ project: ProjectSummary }>("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            title: newProjectTitle.trim() || undefined,
            thesisText: thesis
          })
        });

        setNewProjectTitle("");
        setNewProjectThesis("");
        setActiveProjectId(payload.project.id);
        setActiveView("dashboard");

        await loadProjects();
        await ensureChats(payload.project.id, true);
        await refreshDashboard(payload.project.id);

        setNotification({ kind: "success", title: "Project created" });
      } catch (error) {
        handleApiError(error, "Unable to create project");
      } finally {
        setCreatingProject(false);
      }
    },
    [
      newProjectThesis,
      newProjectTitle,
      loadProjects,
      ensureChats,
      refreshDashboard,
      handleApiError
    ]
  );

  const saveMemoryDoc = useCallback(
    async (projectId: string, docKey: string) => {
      const draft = memoryDrafts[docKey];
      if (!draft || !draft.content.trim()) {
        setNotification({ kind: "warning", title: "Memory content cannot be empty" });
        return;
      }

      setSavingMemoryKey(docKey);
      try {
        await apiRequest<{ ok: true }>(
          `/api/projects/${projectId}/memory-docs/${encodeURIComponent(docKey)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: draft.title.trim() || docKey,
              content: draft.content.trim()
            })
          }
        );
        await refreshDashboard(projectId);
        setNotification({ kind: "success", title: "Memory document saved" });
      } catch (error) {
        handleApiError(error, "Unable to save memory document");
      } finally {
        setSavingMemoryKey(null);
      }
    },
    [memoryDrafts, refreshDashboard, handleApiError]
  );

  const applyExplorerFilters = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setExplorerFilters(explorerDraftFilters);
      if (activeProjectId) {
        await refreshExplorer(activeProjectId, explorerDraftFilters);
      }
    },
    [explorerDraftFilters, activeProjectId, refreshExplorer]
  );

  const submitManualPaper = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!activeProjectId) {
        return;
      }

      if (!manualPaper.title.trim()) {
        setNotification({ kind: "warning", title: "Paper title is required" });
        return;
      }

      setAddingPaper(true);
      try {
        await apiRequest<{ paper: ProjectPaper }>(`/api/projects/${activeProjectId}/papers`, {
          method: "POST",
          body: JSON.stringify({
            title: manualPaper.title.trim(),
            doi: manualPaper.doi.trim() || undefined,
            year: manualPaper.year ? Number(manualPaper.year) : undefined,
            citationCount: manualPaper.citationCount ? Number(manualPaper.citationCount) : undefined,
            abstract: manualPaper.abstract.trim() || undefined,
            fieldsOfStudy: decodeListInput(manualPaper.fields)
          })
        });

        setManualPaper(DEFAULT_MANUAL_PAPER);
        await loadProjects();
        await refreshExplorer(activeProjectId, explorerFilters);
        setNotification({ kind: "success", title: "Paper added" });
      } catch (error) {
        handleApiError(error, "Unable to add paper");
      } finally {
        setAddingPaper(false);
      }
    },
    [activeProjectId, manualPaper, loadProjects, refreshExplorer, explorerFilters, handleApiError]
  );

  const updatePaper = useCallback(
    async (projectId: string, paperId: string, patch: Record<string, unknown>) => {
      setUpdatingPaperId(paperId);
      try {
        await apiRequest<{ paper: ProjectPaper }>(`/api/projects/${projectId}/papers/${paperId}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });

        await loadProjects();
        if (activeView === "explorer") {
          await refreshExplorer(projectId, explorerFilters);
        }
        if (activeView === "reading") {
          await refreshReadingList(projectId);
        }
      } catch (error) {
        handleApiError(error, "Unable to update paper");
      } finally {
        setUpdatingPaperId(null);
      }
    },
    [loadProjects, activeView, refreshExplorer, explorerFilters, refreshReadingList, handleApiError]
  );

  const toggleComments = useCallback(
    async (projectId: string, paperId: string) => {
      const isOpen = openComments[paperId] === true;
      if (isOpen) {
        setOpenComments((prev) => ({ ...prev, [paperId]: false }));
        return;
      }

      setOpenComments((prev) => ({ ...prev, [paperId]: true }));
      if (!paperComments[paperId]) {
        try {
          await fetchPaperComments(projectId, paperId);
        } catch (error) {
          handleApiError(error, "Unable to load comments");
        }
      }
    },
    [openComments, paperComments, fetchPaperComments, handleApiError]
  );

  const saveComment = useCallback(
    async (projectId: string, paperId: string) => {
      const body = (commentDrafts[paperId] || "").trim();
      if (!body) {
        return;
      }
      try {
        await apiRequest<{ comment: ProjectPaperComment }>(
          `/api/projects/${projectId}/papers/${paperId}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body })
          }
        );

        setCommentDrafts((prev) => ({ ...prev, [paperId]: "" }));
        await fetchPaperComments(projectId, paperId);
        await refreshExplorer(projectId, explorerFilters);
      } catch (error) {
        handleApiError(error, "Unable to save comment");
      }
    },
    [commentDrafts, fetchPaperComments, refreshExplorer, explorerFilters, handleApiError]
  );

  const saveReadingEntry = useCallback(
    async (projectId: string, paperId: string) => {
      const draft = readingDrafts[paperId];
      if (!draft) {
        return;
      }

      setSavingReadingPaperId(paperId);
      try {
        await apiRequest<{ paper: ProjectPaper }>(`/api/projects/${projectId}/papers/${paperId}`, {
          method: "PATCH",
          body: JSON.stringify({
            comment: draft.comment.trim() || "",
            tags: decodeListInput(draft.tags)
          })
        });

        await refreshReadingList(projectId);
        await loadProjects();
        setNotification({ kind: "success", title: "Reading notes saved" });
      } catch (error) {
        handleApiError(error, "Unable to save reading notes");
      } finally {
        setSavingReadingPaperId(null);
      }
    },
    [readingDrafts, refreshReadingList, loadProjects, handleApiError]
  );

  const submitChatMessage = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!activeProjectId || !activeChatId || sendingMessage) {
        return;
      }
      const content = chatInput.trim();
      if (!content) {
        return;
      }

      setSendingMessage(true);
      try {
        await apiRequest<{ messages: ProjectChatMessage[] }>(
          `/api/projects/${activeProjectId}/chats/${activeChatId}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ content })
          }
        );

        setChatInput("");
        await ensureChats(activeProjectId, true);
        await refreshChatMessages(activeProjectId, activeChatId);
      } catch (error) {
        handleApiError(error, "Unable to send message");
      } finally {
        setSendingMessage(false);
      }
    },
    [activeProjectId, activeChatId, sendingMessage, chatInput, ensureChats, refreshChatMessages, handleApiError]
  );

  const renderMainActions = () => {
    if (!activeProject) {
      return null;
    }

    if (activeView === "dashboard" || activeView === "explorer" || activeView === "reading") {
      return (
        <>
          <Button size="sm" variant="secondary" onClick={() => void triggerRun(activeProject.id)}>
            Refresh suggestions
          </Button>
          <Button size="sm" onClick={() => openCreateChat(activeProject.id)}>
            New chat
          </Button>
        </>
      );
    }

    if (activeView === "chat") {
      return (
        <>
          <Button size="sm" variant="secondary" onClick={() => openCreateChat(activeProject.id)}>
            New chat
          </Button>
          {activeChat ? (
            <>
              <Button size="sm" variant="outline" onClick={() => openRenameChat(activeProject.id, activeChat)}>
                Rename chat
              </Button>
              <Button size="sm" variant="destructive" onClick={() => requestDeleteChat(activeProject.id, activeChat.id)}>
                Delete chat
              </Button>
            </>
          ) : null}
        </>
      );
    }

    return null;
  };

  if (authState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading workspace...</span>
        </div>
      </main>
    );
  }

  if (authState === "guest") {
    return <GuestLanding />;
  }

  const isErrorNotification = notification?.kind === "error";
  const notificationClassName =
    notification?.kind === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : notification?.kind === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : notification?.kind === "info"
          ? "border-sky-300 bg-sky-50 text-sky-900"
          : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-3">
          <a className="inline-flex items-center gap-2 text-sm font-semibold" href="/">
            <img src="/brand/alexclaw-logo-64.png" alt="Alexclaw logo" width={24} height={24} /> Research Hub
          </a>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Refresh suggestions"
              onClick={() => {
                if (activeProject) {
                  void triggerRun(activeProject.id);
                }
              }}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Create chat"
              onClick={() => {
                if (activeProject) {
                  openCreateChat(activeProject.id);
                }
              }}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Create project"
              onClick={() => {
                setActiveView("new-project");
                setActiveChatId(null);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Log out" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside>
            <ProjectSidebar
              projects={projects}
              chatsByProject={chatsByProject}
              activeProjectId={activeProjectId}
              activeView={activeView}
              activeChatId={activeChatId}
              userEmail={user?.email}
              onCreateProject={() => {
                setActiveView("new-project");
                setActiveChatId(null);
              }}
              onSelectProject={(projectId) => {
                setActiveProjectId(projectId);
                if (activeView === "new-project") {
                  setActiveView("dashboard");
                }
                void ensureChats(projectId, false);
              }}
              onSelectView={(view) => setActiveView(view)}
              onSelectChat={(chatId) => {
                setActiveView("chat");
                setActiveChatId(chatId);
              }}
              onOpenCreateChat={(projectId) => openCreateChat(projectId)}
              onLogout={() => void logout()}
            />
          </aside>

          <section>
            <Card>
              <CardContent className="space-y-6 pt-6">
                <div className="space-y-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{headerTitle}</h1>
                  <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
                  {activeProject ? <div className="flex flex-wrap gap-2">{renderMainActions()}</div> : null}
                </div>

                {notification ? (
                  <Alert className={notificationClassName} variant={isErrorNotification ? "destructive" : "default"}>
                    <AlertTitle>{notification.title}</AlertTitle>
                    {notification.subtitle ? <AlertDescription>{notification.subtitle}</AlertDescription> : null}
                    <Button className="mt-3" size="sm" variant="ghost" onClick={() => setNotification(null)}>
                      Dismiss
                    </Button>
                  </Alert>
                ) : null}

                {projectsLoading && projects.length > 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Refreshing projects...</span>
                  </div>
                ) : null}

                {!activeProject || activeView === "new-project" ? (
                  <NewProjectView
                    newProjectTitle={newProjectTitle}
                    newProjectThesis={newProjectThesis}
                    creatingProject={creatingProject}
                    onSetNewProjectTitle={setNewProjectTitle}
                    onSetNewProjectThesis={setNewProjectThesis}
                    onSubmitNewProject={submitNewProject}
                  />
                ) : null}

                {activeProject && activeView === "dashboard" ? (
                  <DashboardView
                    dashboardLoading={dashboardLoading}
                    dashboard={dashboard}
                    memoryDocs={memoryDocs}
                    memoryDrafts={memoryDrafts}
                    setMemoryDrafts={setMemoryDrafts}
                    savingMemoryKey={savingMemoryKey}
                    onSaveMemoryDoc={(docKey) => void saveMemoryDoc(activeProject.id, docKey)}
                  />
                ) : null}

                {activeProject && activeView === "explorer" ? (
                  <ExplorerView
                    explorerFilters={explorerFilters}
                    explorerDraftFilters={explorerDraftFilters}
                    setExplorerDraftFilters={setExplorerDraftFilters}
                    explorerLoading={explorerLoading}
                    explorerPapers={explorerPapers}
                    paperComments={paperComments}
                    openComments={openComments}
                    commentDrafts={commentDrafts}
                    setCommentDrafts={setCommentDrafts}
                    manualPaper={manualPaper}
                    setManualPaper={setManualPaper}
                    addingPaper={addingPaper}
                    updatingPaperId={updatingPaperId}
                    onApplyExplorerFilters={applyExplorerFilters}
                    onSubmitManualPaper={submitManualPaper}
                    onUpdatePaper={(paperId, patch) => void updatePaper(activeProject.id, paperId, patch)}
                    onToggleComments={(paperId) => void toggleComments(activeProject.id, paperId)}
                    onRequestDeletePaper={(paperId, sourceView) =>
                      requestDeletePaper(activeProject.id, paperId, sourceView)
                    }
                    onSaveComment={(paperId) => void saveComment(activeProject.id, paperId)}
                  />
                ) : null}

                {activeProject && activeView === "reading" ? (
                  <ReadingView
                    readingLoading={readingLoading}
                    readingPapers={readingPapers}
                    readingDrafts={readingDrafts}
                    setReadingDrafts={setReadingDrafts}
                    savingReadingPaperId={savingReadingPaperId}
                    onSaveReadingEntry={(paperId) => void saveReadingEntry(activeProject.id, paperId)}
                    onUpdatePaper={(paperId, patch) => void updatePaper(activeProject.id, paperId, patch)}
                    onRequestDeletePaper={(paperId, sourceView) =>
                      requestDeletePaper(activeProject.id, paperId, sourceView)
                    }
                  />
                ) : null}

                {activeProject && activeView === "chat" ? (
                  <ChatView
                    activeChat={activeChat}
                    chatLoading={chatLoading}
                    chatMessages={chatMessages}
                    chatInput={chatInput}
                    sendingMessage={sendingMessage}
                    onSetChatInput={setChatInput}
                    onOpenCreateChat={() => openCreateChat(activeProject.id)}
                    onSubmitChatMessage={submitChatMessage}
                  />
                ) : null}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <Dialog
        open={chatModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setChatModal(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{chatModal?.mode === "create" ? "Create chat" : "Rename chat"}</DialogTitle>
            <DialogDescription>Set a title now or keep it empty for an auto-generated name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="chat-modal-title">
              Chat title
            </label>
            <Input
              id="chat-modal-title"
              placeholder="Optional title"
              value={chatModal?.title || ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setChatModal((prev) => (prev ? { ...prev, title: value } : prev));
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChatModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={chatModalBusy || !(chatModal?.title.trim() || chatModal?.mode === "create")}
              onClick={() => void submitChatModal()}
            >
              {chatModal?.mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmModal(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmModal?.heading || "Confirm"}</DialogTitle>
            <DialogDescription>{confirmModal?.body}</DialogDescription>
          </DialogHeader>
          <Separator />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmModal(null)}>
              Cancel
            </Button>
            <Button disabled={confirmModalBusy} variant="destructive" onClick={() => void submitConfirmModal()}>
              {confirmModal?.confirmLabel || "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
