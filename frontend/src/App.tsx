import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Loading,
  Modal,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
  Theme,
  Tile
} from "@carbon/react";

import { ApiError, apiRequest } from "./api";
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

const decodeListInput = (raw: string): string[] => {
  const seen = new Set<string>();
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const projectTitle = (project: ProjectSummary): string => {
  const title = typeof project.title === "string" ? project.title.trim() : "";
  return title || `Project ${project.id.slice(0, 8)}`;
};

const projectStatusLabel = (project: ProjectSummary): string => {
  const status = project.latestRun?.status;
  if (status === "RUNNING" || status === "QUEUED") {
    return "Updating suggestions";
  }
  if (status === "FAILED") {
    return "Needs another pass";
  }
  if (status === "COMPLETED") {
    return "Suggestions ready";
  }
  return "Ready";
};

const isProjectUpdating = (project: ProjectSummary): boolean =>
  project.latestRun?.status === "RUNNING" || project.latestRun?.status === "QUEUED";

const mapSortLabel = (sort: ExplorerFilters["sort"]): string => {
  if (sort === "recent") {
    return "Recent";
  }
  if (sort === "citations") {
    return "Citations";
  }
  if (sort === "newest") {
    return "Recently added";
  }
  return "Most relevant";
};

const dashboardStatusLine = (dashboard: ProjectDashboard | null): string => {
  if (!dashboard?.latestRun) {
    return "Suggestions will appear after the first background pass.";
  }
  if (dashboard.latestRun.status === "FAILED") {
    return "Background suggestions need another pass.";
  }
  if (dashboard.latestRun.status === "RUNNING" || dashboard.latestRun.status === "QUEUED") {
    return "Background suggestions are updating.";
  }
  return "Background suggestions are ready.";
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
          <Button kind="secondary" size="sm" onClick={() => void triggerRun(activeProject.id)}>
            Refresh suggestions
          </Button>
          <Button kind="primary" size="sm" onClick={() => openCreateChat(activeProject.id)}>
            New chat
          </Button>
        </>
      );
    }

    if (activeView === "chat") {
      return (
        <>
          <Button kind="secondary" size="sm" onClick={() => openCreateChat(activeProject.id)}>
            New chat
          </Button>
          {activeChat ? (
            <>
              <Button kind="tertiary" size="sm" onClick={() => openRenameChat(activeProject.id, activeChat)}>
                Rename chat
              </Button>
              <Button
                kind="danger--tertiary"
                size="sm"
                onClick={() => requestDeleteChat(activeProject.id, activeChat.id)}
              >
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
      <Theme theme="g10">
        <Loading withOverlay description="Loading workspace" />
      </Theme>
    );
  }

  if (authState === "guest") {
    return (
      <Theme theme="g10">
        <main className="landing-shell">
          <Tile className="landing-card">
            <p className="cds--type-label-01">Alexclaw Research Hub</p>
            <h1 className="cds--type-productive-heading-06">Your thesis workspace, now Carbon-native.</h1>
            <p className="cds--type-body-01 understated">
              Create a project with thesis text and background research starts automatically. Use dashboard,
              explorer, reading list, and chat in one place.
            </p>
            <ul className="landing-list cds--type-body-01">
              <li>Project-scoped papers, memory docs, and chats.</li>
              <li>Integrated notes, comments, and reading workflow.</li>
              <li>Background refreshes while you keep writing.</li>
            </ul>
            <div>
              <Button kind="primary" href="/auth/google">
                Sign in with Google
              </Button>
            </div>
          </Tile>
        </main>
      </Theme>
    );
  }

  return (
    <Theme theme="g10">
      <div className="app-root">
        <div className="app-body">
          <Tile className="sidebar-panel">
            <div className="sidebar-header">
              <h2 className="cds--type-productive-heading-03">Projects</h2>
              <Button
                kind="primary"
                size="sm"
                onClick={() => {
                  setActiveView("new-project");
                  setActiveChatId(null);
                }}
              >
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
                          onClick={() => {
                            setActiveProjectId(project.id);
                            if (activeView === "new-project") {
                              setActiveView("dashboard");
                            }
                            void ensureChats(project.id, false);
                          }}
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
                              onClick={() => setActiveView("dashboard")}
                            >
                              Dashboard
                            </Button>
                            <Button
                              kind={activeView === "explorer" ? "secondary" : "ghost"}
                              size="sm"
                              className="sidebar-button"
                              onClick={() => setActiveView("explorer")}
                            >
                              Paper explorer
                            </Button>
                            <Button
                              kind={activeView === "reading" ? "secondary" : "ghost"}
                              size="sm"
                              className="sidebar-button"
                              onClick={() => setActiveView("reading")}
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
                                  onClick={() => {
                                    setActiveView("chat");
                                    setActiveChatId(chat.id);
                                  }}
                                >
                                  {chat.title}
                                </Button>
                              ))
                            )}

                            <Button
                              kind="tertiary"
                              size="sm"
                              className="sidebar-button"
                              onClick={() => openCreateChat(project.id)}
                            >
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
              <p className="user-email cds--type-body-compact-01">{user?.email}</p>
              <Button kind="ghost" size="sm" onClick={() => void logout()}>
                Log out
              </Button>
            </div>
          </Tile>

          <Tile className="main-panel">
            <div className="main-head">
              <div className="main-title-block">
                <h1 className="cds--type-productive-heading-05">{headerTitle}</h1>
                <p className="main-subtitle cds--type-body-01">{headerSubtitle}</p>
              </div>
              <div className="main-actions">{renderMainActions()}</div>
            </div>

            <div className="main-notice">
              {notification ? (
                <InlineNotification
                  lowContrast
                  kind={notification.kind}
                  title={notification.title}
                  subtitle={notification.subtitle}
                  onCloseButtonClick={() => setNotification(null)}
                />
              ) : null}
            </div>

            <div className="main-content">
              {projectsLoading && projects.length > 0 ? (
                <InlineLoading description="Refreshing projects..." />
              ) : null}

              {!activeProject || activeView === "new-project" ? (
                <Tile>
                  <form className="form-stack" onSubmit={submitNewProject}>
                    <h3 className="cds--type-productive-heading-03">New project</h3>
                    <p className="cds--type-body-01 understated">
                      Paste thesis text to initialize dashboard, explorer, reading workflow, and chat.
                    </p>
                    <TextInput
                      id="project-title"
                      labelText="Project title (optional)"
                      value={newProjectTitle}
                      placeholder="e.g. AI and urban policy"
                      onChange={(event) => setNewProjectTitle(event.currentTarget.value)}
                    />
                    <TextArea
                      id="project-thesis"
                      labelText="Thesis text"
                      value={newProjectThesis}
                      rows={8}
                      placeholder="Paste at least 30 characters"
                      onChange={(event) => setNewProjectThesis(event.currentTarget.value)}
                    />
                    <div>
                      <Button type="submit" kind="primary" disabled={creatingProject}>
                        {creatingProject ? "Creating project..." : "Create project"}
                      </Button>
                    </div>
                  </form>
                </Tile>
              ) : null}

              {activeProject && activeView === "dashboard" ? (
                <>
                  {dashboardLoading ? <InlineLoading description="Loading dashboard..." /> : null}

                  {dashboard ? (
                    <>
                      <section className="stat-grid">
                        <Tile className="stat-tile">
                          <p className="metric-label cds--type-label-01">Papers</p>
                          <p className="metric-value cds--type-productive-heading-04">{dashboard.stats.papers}</p>
                        </Tile>
                        <Tile className="stat-tile">
                          <p className="metric-label cds--type-label-01">Open Access</p>
                          <p className="metric-value cds--type-productive-heading-04">{dashboard.stats.openAccess}</p>
                        </Tile>
                        <Tile className="stat-tile">
                          <p className="metric-label cds--type-label-01">Reading List</p>
                          <p className="metric-value cds--type-productive-heading-04">{dashboard.stats.readingList}</p>
                        </Tile>
                        <Tile className="stat-tile">
                          <p className="metric-label cds--type-label-01">Chats</p>
                          <p className="metric-value cds--type-productive-heading-04">{dashboard.stats.chats}</p>
                        </Tile>
                      </section>

                      <Tile className="stack">
                        <h3 className="cds--type-productive-heading-03">Project summary</h3>
                        <p className="cds--type-body-01">
                          {dashboard.summary.thesisSummary ||
                            "Your thesis summary will appear after the background run completes."}
                        </p>
                        <div className="inline-tags">
                          <Tag type="green">Foundational: {dashboard.stats.foundational}</Tag>
                          <Tag type="cyan">Depth: {dashboard.stats.depth}</Tag>
                          <Tag type="gray">Background: {dashboard.stats.background}</Tag>
                          <Tag type="magenta">Bookmarked: {dashboard.stats.bookmarked}</Tag>
                        </div>
                        <p className="cds--type-body-compact-01 understated">{dashboardStatusLine(dashboard)}</p>
                      </Tile>

                      <Tile className="stack">
                        <h3 className="cds--type-productive-heading-03">Project memory docs</h3>
                        <p className="cds--type-body-01 understated">
                          Chats update memory docs automatically. You can refine each document manually.
                        </p>

                        {memoryDocs.length === 0 ? (
                          <p className="empty-note cds--type-body-01">No memory docs yet.</p>
                        ) : (
                          memoryDocs.map((doc) => {
                            const draft = memoryDrafts[doc.key] || { title: doc.title, content: doc.content };
                            return (
                              <Tile key={doc.id} className="stack">
                                <div className="form-grid">
                                  <TextInput
                                    id={`memory-title-${doc.key}`}
                                    labelText="Title"
                                    value={draft.title}
                                    onChange={(event) =>
                                      setMemoryDrafts((prev) => ({
                                        ...prev,
                                        [doc.key]: {
                                          ...draft,
                                          title: event.currentTarget.value
                                        }
                                      }))
                                    }
                                  />
                                  <TextInput
                                    id={`memory-source-${doc.key}`}
                                    labelText="Source"
                                    value={doc.source}
                                    readOnly
                                  />
                                </div>

                                <TextArea
                                  id={`memory-content-${doc.key}`}
                                  labelText="Content"
                                  rows={8}
                                  value={draft.content}
                                  onChange={(event) =>
                                    setMemoryDrafts((prev) => ({
                                      ...prev,
                                      [doc.key]: {
                                        ...draft,
                                        content: event.currentTarget.value
                                      }
                                    }))
                                  }
                                />

                                <div className="table-actions">
                                  <Button
                                    kind="secondary"
                                    size="sm"
                                    disabled={savingMemoryKey === doc.key}
                                    onClick={() => void saveMemoryDoc(activeProject.id, doc.key)}
                                  >
                                    {savingMemoryKey === doc.key ? "Saving..." : "Save memory doc"}
                                  </Button>
                                  <p className="cds--type-body-compact-01 understated">
                                    Updated {formatDate(doc.updatedAt)}
                                  </p>
                                </div>
                              </Tile>
                            );
                          })
                        )}
                      </Tile>
                    </>
                  ) : null}
                </>
              ) : null}

              {activeProject && activeView === "explorer" ? (
                <>
                  <Tile>
                    <form className="form-stack" onSubmit={applyExplorerFilters}>
                      <h3 className="cds--type-productive-heading-03">Filters</h3>
                      <div className="form-grid compact">
                        <TextInput
                          id="explorer-query"
                          labelText="Search"
                          value={explorerDraftFilters.query}
                          placeholder="Title, abstract, DOI"
                          onChange={(event) =>
                            setExplorerDraftFilters((prev) => ({
                              ...prev,
                              query: event.currentTarget.value
                            }))
                          }
                        />

                        <Select
                          id="explorer-sort"
                          labelText="Sort"
                          value={explorerDraftFilters.sort}
                          onChange={(event) =>
                            setExplorerDraftFilters((prev) => ({
                              ...prev,
                              sort: event.currentTarget.value as ExplorerFilters["sort"]
                            }))
                          }
                        >
                          <SelectItem value="relevance" text="Most relevant" />
                          <SelectItem value="recent" text="Recent" />
                          <SelectItem value="citations" text="Citations" />
                          <SelectItem value="newest" text="Recently added" />
                        </Select>

                        <Select
                          id="explorer-tier"
                          labelText="Tier"
                          value={explorerDraftFilters.tier}
                          onChange={(event) =>
                            setExplorerDraftFilters((prev) => ({
                              ...prev,
                              tier: event.currentTarget.value as ExplorerFilters["tier"]
                            }))
                          }
                        >
                          <SelectItem value="" text="All tiers" />
                          <SelectItem value="FOUNDATIONAL" text="Foundational" />
                          <SelectItem value="DEPTH" text="Depth" />
                          <SelectItem value="BACKGROUND" text="Background" />
                        </Select>
                      </div>

                      <div className="form-grid">
                        <Select
                          id="explorer-oa"
                          labelText="Open access"
                          value={explorerDraftFilters.oaOnly ? "true" : "false"}
                          onChange={(event) =>
                            setExplorerDraftFilters((prev) => ({
                              ...prev,
                              oaOnly: event.currentTarget.value === "true"
                            }))
                          }
                        >
                          <SelectItem value="false" text="All" />
                          <SelectItem value="true" text="Open access only" />
                        </Select>

                        <Select
                          id="explorer-bookmarked"
                          labelText="Bookmarks"
                          value={explorerDraftFilters.bookmarkedOnly ? "true" : "false"}
                          onChange={(event) =>
                            setExplorerDraftFilters((prev) => ({
                              ...prev,
                              bookmarkedOnly: event.currentTarget.value === "true"
                            }))
                          }
                        >
                          <SelectItem value="false" text="All" />
                          <SelectItem value="true" text="Bookmarked only" />
                        </Select>
                      </div>

                      <div className="table-actions">
                        <Button type="submit" kind="secondary" size="sm">
                          Apply filters
                        </Button>
                        <p className="cds--type-body-compact-01 understated">
                          Sorting by: {mapSortLabel(explorerFilters.sort)}
                        </p>
                      </div>
                    </form>
                  </Tile>

                  <Tile>
                    <form className="form-stack" onSubmit={submitManualPaper}>
                      <h3 className="cds--type-productive-heading-03">Add paper manually</h3>
                      <div className="form-grid">
                        <TextInput
                          id="manual-title"
                          labelText="Title"
                          value={manualPaper.title}
                          onChange={(event) =>
                            setManualPaper((prev) => ({ ...prev, title: event.currentTarget.value }))
                          }
                        />
                        <TextInput
                          id="manual-doi"
                          labelText="DOI"
                          value={manualPaper.doi}
                          onChange={(event) =>
                            setManualPaper((prev) => ({ ...prev, doi: event.currentTarget.value }))
                          }
                        />
                      </div>

                      <div className="form-grid">
                        <TextInput
                          id="manual-year"
                          labelText="Year"
                          value={manualPaper.year}
                          onChange={(event) =>
                            setManualPaper((prev) => ({ ...prev, year: event.currentTarget.value }))
                          }
                        />
                        <TextInput
                          id="manual-citations"
                          labelText="Citation count"
                          value={manualPaper.citationCount}
                          onChange={(event) =>
                            setManualPaper((prev) => ({ ...prev, citationCount: event.currentTarget.value }))
                          }
                        />
                      </div>

                      <TextInput
                        id="manual-fields"
                        labelText="Fields of study (comma-separated)"
                        value={manualPaper.fields}
                        onChange={(event) =>
                          setManualPaper((prev) => ({ ...prev, fields: event.currentTarget.value }))
                        }
                      />

                      <TextArea
                        id="manual-abstract"
                        labelText="Abstract"
                        value={manualPaper.abstract}
                        rows={4}
                        onChange={(event) =>
                          setManualPaper((prev) => ({ ...prev, abstract: event.currentTarget.value }))
                        }
                      />

                      <div>
                        <Button type="submit" kind="primary" disabled={addingPaper}>
                          {addingPaper ? "Adding paper..." : "Add paper"}
                        </Button>
                      </div>
                    </form>
                  </Tile>

                  <Tile className="stack">
                    <h3 className="cds--type-productive-heading-03">Paper explorer</h3>
                    {explorerLoading ? <InlineLoading description="Loading papers..." /> : null}
                    {explorerPapers.length === 0 && !explorerLoading ? (
                      <p className="empty-note cds--type-body-01">No papers match the current filters.</p>
                    ) : null}

                    {explorerPapers.length > 0 ? (
                      <div className="stack">
                        <Table aria-label="Project papers">
                          <TableHead>
                            <TableRow>
                              <TableHeader>Paper</TableHeader>
                              <TableHeader>Tier</TableHeader>
                              <TableHeader>Year</TableHeader>
                              <TableHeader>Citations</TableHeader>
                              <TableHeader>Actions</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {explorerPapers.map((paper) => (
                              <TableRow key={paper.id}>
                                <TableCell>
                                  <div className="table-meta">
                                    <p className="paper-title cds--type-body-01">{paper.title}</p>
                                    <p className="paper-subtext cds--type-body-compact-01">
                                      {(paper.abstract || "No abstract available").slice(0, 220)}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Tag type="gray">{paper.tier || "MANUAL"}</Tag>
                                </TableCell>
                                <TableCell>{paper.year || "n/a"}</TableCell>
                                <TableCell>{paper.citationCount || 0}</TableCell>
                                <TableCell>
                                  <div className="table-actions">
                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      disabled={updatingPaperId === paper.id}
                                      onClick={() =>
                                        void updatePaper(activeProject.id, paper.id, {
                                          bookmarked: !paper.bookmarked
                                        })
                                      }
                                    >
                                      {paper.bookmarked ? "Bookmarked" : "Bookmark"}
                                    </Button>

                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      disabled={updatingPaperId === paper.id}
                                      onClick={() =>
                                        void updatePaper(activeProject.id, paper.id, {
                                          inReadingList: !paper.inReadingList
                                        })
                                      }
                                    >
                                      {paper.inReadingList ? "In reading list" : "Add to reading list"}
                                    </Button>

                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      onClick={() => void toggleComments(activeProject.id, paper.id)}
                                    >
                                      {openComments[paper.id] ? "Hide comments" : `Comments (${paper.commentCount || 0})`}
                                    </Button>

                                    <Button
                                      kind="danger--ghost"
                                      size="sm"
                                      onClick={() => requestDeletePaper(activeProject.id, paper.id, "explorer")}
                                    >
                                      Remove
                                    </Button>

                                    {paper.access?.pdfUrl ? (
                                      <Button kind="tertiary" size="sm" href={paper.access.pdfUrl} target="_blank">
                                        Open PDF
                                      </Button>
                                    ) : null}
                                    {paper.doi ? (
                                      <Button
                                        kind="tertiary"
                                        size="sm"
                                        href={`https://doi.org/${encodeURIComponent(paper.doi)}`}
                                        target="_blank"
                                      >
                                        DOI
                                      </Button>
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {explorerPapers
                          .filter((paper) => openComments[paper.id])
                          .map((paper) => {
                            const comments = paperComments[paper.id] || [];
                            return (
                              <Tile key={`comments-${paper.id}`} className="comments-panel">
                                <h4 className="cds--type-productive-heading-03">Comments · {paper.title}</h4>
                                {comments.length === 0 ? (
                                  <p className="empty-note cds--type-body-compact-01">No comments yet.</p>
                                ) : (
                                  <ul className="comments-list">
                                    {comments.map((comment) => (
                                      <li key={comment.id} className="comment-item cds--type-body-compact-01">
                                        <p className="cds--type-body-compact-01">{comment.body}</p>
                                        <p className="cds--type-body-compact-01">
                                          {formatDate(comment.createdAt)}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                <TextArea
                                  id={`comment-${paper.id}`}
                                  labelText="Add comment"
                                  rows={3}
                                  value={commentDrafts[paper.id] || ""}
                                  onChange={(event) =>
                                    setCommentDrafts((prev) => ({
                                      ...prev,
                                      [paper.id]: event.currentTarget.value
                                    }))
                                  }
                                />
                                <div>
                                  <Button kind="secondary" size="sm" onClick={() => void saveComment(activeProject.id, paper.id)}>
                                    Save comment
                                  </Button>
                                </div>
                              </Tile>
                            );
                          })}
                      </div>
                    ) : null}
                  </Tile>
                </>
              ) : null}

              {activeProject && activeView === "reading" ? (
                <Tile className="reading-list">
                  <h3 className="cds--type-productive-heading-03">Reading list</h3>
                  {readingLoading ? <InlineLoading description="Loading reading list..." /> : null}
                  {readingPapers.length === 0 && !readingLoading ? (
                    <p className="empty-note cds--type-body-01">
                      Reading list is empty. Add papers from the explorer.
                    </p>
                  ) : null}

                  {readingPapers.map((paper) => {
                    const draft = readingDrafts[paper.id] || { tags: "", comment: "" };
                    return (
                      <Tile key={paper.id} className="stack">
                        <div className="table-meta">
                          <h4 className="paper-title cds--type-productive-heading-03">{paper.title}</h4>
                          <p className="paper-subtext cds--type-body-compact-01">
                            {paper.year || "Year n/a"} · {paper.citationCount || 0} citations · {paper.tier || "MANUAL"}
                          </p>
                        </div>

                        <TextInput
                          id={`reading-tags-${paper.id}`}
                          labelText="Tags (comma-separated)"
                          value={draft.tags}
                          onChange={(event) =>
                            setReadingDrafts((prev) => ({
                              ...prev,
                              [paper.id]: {
                                ...draft,
                                tags: event.currentTarget.value
                              }
                            }))
                          }
                        />

                        <TextArea
                          id={`reading-comment-${paper.id}`}
                          labelText="Comments"
                          rows={4}
                          value={draft.comment}
                          onChange={(event) =>
                            setReadingDrafts((prev) => ({
                              ...prev,
                              [paper.id]: {
                                ...draft,
                                comment: event.currentTarget.value
                              }
                            }))
                          }
                        />

                        <div className="table-actions">
                          <Button
                            kind="secondary"
                            size="sm"
                            disabled={savingReadingPaperId === paper.id}
                            onClick={() => void saveReadingEntry(activeProject.id, paper.id)}
                          >
                            {savingReadingPaperId === paper.id ? "Saving..." : "Save notes"}
                          </Button>

                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() =>
                              void updatePaper(activeProject.id, paper.id, {
                                bookmarked: !paper.bookmarked
                              })
                            }
                          >
                            {paper.bookmarked ? "Bookmarked" : "Bookmark"}
                          </Button>

                          <Button
                            kind="danger--ghost"
                            size="sm"
                            onClick={() =>
                              void updatePaper(activeProject.id, paper.id, {
                                inReadingList: false
                              })
                            }
                          >
                            Remove from list
                          </Button>

                          <Button
                            kind="danger--tertiary"
                            size="sm"
                            onClick={() => requestDeletePaper(activeProject.id, paper.id, "reading")}
                          >
                            Delete paper
                          </Button>

                          {paper.access?.pdfUrl ? (
                            <Button kind="tertiary" size="sm" href={paper.access.pdfUrl} target="_blank">
                              Open PDF
                            </Button>
                          ) : null}
                        </div>
                      </Tile>
                    );
                  })}
                </Tile>
              ) : null}

              {activeProject && activeView === "chat" ? (
                <>
                  {!activeChat ? (
                    <Tile className="stack">
                      <h3 className="cds--type-productive-heading-03">Start a chat</h3>
                      <p className="cds--type-body-01 understated">
                        Open a chat to debate your thesis, synthesize findings, and plan writing tasks.
                      </p>
                      <div>
                        <Button kind="primary" onClick={() => openCreateChat(activeProject.id)}>
                          Create chat
                        </Button>
                      </div>
                    </Tile>
                  ) : (
                    <Tile className="chat-shell">
                      <div className="chat-messages" id="chat-messages">
                        {chatLoading ? <InlineLoading description="Loading messages..." /> : null}
                        {!chatLoading && chatMessages.length === 0 ? (
                          <p className="empty-note cds--type-body-01">No messages yet. Start the conversation.</p>
                        ) : null}

                        {chatMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`chat-row ${message.role === "user" ? "user" : "assistant"}`}
                          >
                            <div className="chat-bubble cds--type-body-01">{message.content}</div>
                          </div>
                        ))}
                      </div>

                      <form className="chat-composer" onSubmit={submitChatMessage}>
                        <TextArea
                          id="chat-input"
                          labelText="Message"
                          hideLabel
                          rows={3}
                          placeholder="Ask anything about your thesis, sources, or next plan."
                          value={chatInput}
                          onChange={(event) => setChatInput(event.currentTarget.value)}
                        />
                        <Button type="submit" kind="primary" disabled={sendingMessage}>
                          {sendingMessage ? "Sending..." : "Send"}
                        </Button>
                      </form>
                    </Tile>
                  )}
                </>
              ) : null}
            </div>
          </Tile>
        </div>

        <Modal
          open={chatModal !== null}
          modalHeading={chatModal?.mode === "create" ? "Create chat" : "Rename chat"}
          primaryButtonText={chatModal?.mode === "create" ? "Create" : "Save"}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={chatModalBusy || !(chatModal?.title.trim() || chatModal?.mode === "create")}
          onRequestClose={() => setChatModal(null)}
          onRequestSubmit={() => void submitChatModal()}
        >
          <TextInput
            id="chat-modal-title"
            labelText="Chat title"
            placeholder="Optional title"
            value={chatModal?.title || ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setChatModal((prev) => (prev ? { ...prev, title: value } : prev));
            }}
          />
        </Modal>

        <Modal
          open={confirmModal !== null}
          danger
          modalHeading={confirmModal?.heading || "Confirm"}
          primaryButtonText={confirmModal?.confirmLabel || "Confirm"}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={confirmModalBusy}
          onRequestClose={() => setConfirmModal(null)}
          onRequestSubmit={() => void submitConfirmModal()}
        >
          <p className="cds--type-body-01">{confirmModal?.body}</p>
        </Modal>
      </div>
    </Theme>
  );
}
