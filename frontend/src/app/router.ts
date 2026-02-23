export type ProjectSection = "dashboard" | "papers" | "chats" | "memory";

export type AppRoute =
  | { page: "home"; pathname: string }
  | { page: "login"; pathname: string }
  | { page: "projects"; pathname: string }
  | { page: "project"; pathname: string; projectId: string; section: ProjectSection; chatId?: string }
  | { page: "not_found"; pathname: string };

const NAV_EVENT = "alexclaw:navigate";

export const parseRoute = (pathname: string): AppRoute => {
  if (pathname === "/") {
    return { page: "home", pathname };
  }
  if (pathname === "/login") {
    return { page: "login", pathname };
  }
  if (pathname === "/projects") {
    return { page: "projects", pathname };
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects" || !segments[1]) {
    return { page: "not_found", pathname };
  }

  const projectId = segments[1];
  const section = segments[2];

  if (section === "dashboard") {
    return { page: "project", pathname, projectId, section: "dashboard" };
  }
  if (section === "papers") {
    return { page: "project", pathname, projectId, section: "papers" };
  }
  if (section === "memory") {
    return { page: "project", pathname, projectId, section: "memory" };
  }
  if (section === "chats") {
    return {
      page: "project",
      pathname,
      projectId,
      section: "chats",
      chatId: segments[3],
    };
  }

  return { page: "not_found", pathname };
};

export const buildProjectPath = (projectId: string, section: ProjectSection, chatId?: string): string => {
  if (section === "chats" && chatId) {
    return `/projects/${projectId}/chats/${chatId}`;
  }
  return `/projects/${projectId}/${section}`;
};

export const navigate = (pathname: string, replace = false): void => {
  if (replace) {
    window.history.replaceState(null, "", pathname);
  } else {
    window.history.pushState(null, "", pathname);
  }
  window.dispatchEvent(new Event(NAV_EVENT));
};

export const subscribeNavigation = (callback: () => void): (() => void) => {
  const handler = () => callback();
  window.addEventListener("popstate", handler);
  window.addEventListener(NAV_EVENT, handler);
  return () => {
    window.removeEventListener("popstate", handler);
    window.removeEventListener(NAV_EVENT, handler);
  };
};
