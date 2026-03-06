export type ProjectSection =
  | "dashboard"
  | "documents"
  | "runs"
  | "workbench"
  | "datasets"
  | "audit"
  | "papers"
  | "chats"
  | "memory";
export type SitePageAccess = "public" | "auth";
export type SitePageKey =
  | "account"
  | "security"
  | "billing"
  | "privacy"
  | "terms"
  | "cookies"
  | "support"
  | "help"
  | "status"
  | "data_controls"
  | "subprocessors"
  | "compliance"
  | "changelog"
  | "about"
  | "pricing";

export const SITE_PAGE_META: Record<SitePageKey, {
  path: string;
  title: string;
  subtitle: string;
  access: SitePageAccess;
}> = {
  account: {
    path: "/account",
    title: "Account Settings",
    subtitle: "Manage your profile and preferences",
    access: "auth",
  },
  security: {
    path: "/security",
    title: "Security",
    subtitle: "Sessions, authentication, and access controls",
    access: "auth",
  },
  billing: {
    path: "/billing",
    title: "Billing & Invoices",
    subtitle: "Subscription, payment methods, and invoices",
    access: "auth",
  },
  privacy: {
    path: "/privacy",
    title: "Privacy Policy",
    subtitle: "How data is collected, used, and retained",
    access: "public",
  },
  terms: {
    path: "/terms",
    title: "Terms of Use",
    subtitle: "Rules, responsibilities, and service terms",
    access: "public",
  },
  cookies: {
    path: "/cookies",
    title: "Cookie Policy",
    subtitle: "Cookie usage, categories, and controls",
    access: "public",
  },
  support: {
    path: "/support",
    title: "Contact & Support",
    subtitle: "Ways to reach support and escalate issues",
    access: "public",
  },
  help: {
    path: "/help",
    title: "Help Center",
    subtitle: "FAQ, getting started guides, and troubleshooting",
    access: "public",
  },
  status: {
    path: "/status",
    title: "Status",
    subtitle: "Current service health and incident history",
    access: "public",
  },
  data_controls: {
    path: "/data-controls",
    title: "Data Controls",
    subtitle: "Export, retention, and account deletion controls",
    access: "auth",
  },
  subprocessors: {
    path: "/subprocessors",
    title: "Subprocessors",
    subtitle: "Third-party service providers and purposes",
    access: "public",
  },
  compliance: {
    path: "/compliance",
    title: "Compliance",
    subtitle: "DPA and privacy/compliance commitments",
    access: "public",
  },
  changelog: {
    path: "/changelog",
    title: "Changelog",
    subtitle: "Product updates and release notes",
    access: "public",
  },
  about: {
    path: "/about",
    title: "About",
    subtitle: "What Alexclaw is and how it works",
    access: "public",
  },
  pricing: {
    path: "/pricing",
    title: "Pricing",
    subtitle: "Plans, limits, and feature comparison",
    access: "public",
  },
};

const SITE_PATH_TO_PAGE = new Map<string, SitePageKey>(
  Object.entries(SITE_PAGE_META).map(([key, value]) => [value.path, key as SitePageKey])
);

export type AppRoute =
  | { page: "home"; pathname: string }
  | { page: "login"; pathname: string }
  | { page: "projects"; pathname: string }
  | { page: "project"; pathname: string; projectId: string; section: ProjectSection; chatId?: string }
  | { page: "site"; pathname: string; site: SitePageKey }
  | { page: "not_found"; pathname: string };

const NAV_EVENT = "alexclaw:navigate";

export const parseRoute = (pathname: string): AppRoute => {
  const normalizedPathname =
    pathname !== "/" && pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;

  if (normalizedPathname === "/") {
    return { page: "home", pathname: normalizedPathname };
  }
  if (normalizedPathname === "/login") {
    return { page: "login", pathname: normalizedPathname };
  }
  if (normalizedPathname === "/projects") {
    return { page: "projects", pathname: normalizedPathname };
  }
  if (normalizedPathname === "/contact") {
    return { page: "site", pathname: normalizedPathname, site: "support" };
  }

  const sitePage = SITE_PATH_TO_PAGE.get(normalizedPathname);
  if (sitePage) {
    return { page: "site", pathname: normalizedPathname, site: sitePage };
  }

  const segments = normalizedPathname.split("/").filter(Boolean);
  if (segments[0] !== "projects" || !segments[1]) {
    return { page: "not_found", pathname: normalizedPathname };
  }

  const projectId = segments[1];
  const section = segments[2];

  if (section === "dashboard") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "dashboard" };
  }
  if (section === "papers") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "papers" };
  }
  if (section === "documents") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "documents" };
  }
  if (section === "runs") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "runs" };
  }
  if (section === "workbench") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "workbench" };
  }
  if (section === "datasets") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "datasets" };
  }
  if (section === "audit") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "audit" };
  }
  if (section === "memory") {
    return { page: "project", pathname: normalizedPathname, projectId, section: "memory" };
  }
  if (section === "chats") {
    return {
      page: "project",
      pathname: normalizedPathname,
      projectId,
      section: "chats",
      chatId: segments[3],
    };
  }

  return { page: "not_found", pathname: normalizedPathname };
};

export const buildProjectPath = (projectId: string, section: ProjectSection, chatId?: string): string => {
  if (section === "chats" && chatId) {
    return `/projects/${projectId}/chats/${chatId}`;
  }
  return `/projects/${projectId}/${section}`;
};

export const buildSitePath = (page: SitePageKey): string => SITE_PAGE_META[page].path;

export const routeRequiresAuth = (route: AppRoute): boolean => {
  if (route.page === "projects" || route.page === "project") {
    return true;
  }
  if (route.page === "site") {
    return SITE_PAGE_META[route.site].access === "auth";
  }
  return false;
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
