"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { InspirationItem, Project, ResearchItem } from "@/lib/types";
import { prepareUserWorkspaceStorage, userWorkspaceStorageKey, workspaceStorageKeys } from "@/lib/workspace-storage";

type Theme = "light" | "dark";

export interface NewProjectInput {
  name: string;
  brand: string;
  market: string;
  description: string;
  competitors: string[];
}

export interface NewInspirationInput {
  title: string;
  type: string;
  source: string;
  note: string;
}

export interface NewResearchInput {
  title: string;
  type: string;
  source: string;
  summary: string;
}

interface AppContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  theme: Theme;
  toggleTheme: () => void;
  projects: Project[];
  createProject: (input: NewProjectInput) => Project;
  projectDialogOpen: boolean;
  setProjectDialogOpen: (value: boolean) => void;
  activeProjectId: string;
  setActiveProjectId: (value: string) => void;
  inspirationItems: InspirationItem[];
  addInspiration: (input: NewInspirationInput) => InspirationItem;
  researchItems: ResearchItem[];
  addResearch: (input: NewResearchInput) => ResearchItem;
  savedIds: string[];
  toggleSaved: (id: string) => void;
  removeSavedIds: (ids: string[]) => void;
  searchOpen: boolean;
  setSearchOpen: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const projectColors = ["#dfff4f", "#93b8ff", "#ff7d68", "#bd9cff", "#72e99b"];

function parseStored<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const workspaceUserId = status === "authenticated" ? user?.id ?? "" : "";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [projects, setProjects] = useState<Project[]>([]);
  const [inspirationItems, setInspirationItems] = useState<InspirationItem[]>([]);
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const hydratePreferences = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem("sift-theme") as Theme | null;
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initialTheme = savedTheme ?? (systemDark ? "dark" : "light");
      setTheme(initialTheme);
      document.documentElement.dataset.theme = initialTheme;
    }, 0);
    return () => window.clearTimeout(hydratePreferences);
  }, []);

  useEffect(() => {
    const hydrateWorkspace = window.setTimeout(() => {
      setProjects([]);
      setInspirationItems([]);
      setResearchItems([]);
      setSavedIds([]);
      setActiveProjectIdState("");
      setProjectDialogOpen(false);
      setSearchOpen(false);
      if (!workspaceUserId) return;

      prepareUserWorkspaceStorage(window.localStorage, workspaceUserId);
      const scoped = (legacyKey: string) => userWorkspaceStorageKey(workspaceUserId, legacyKey);
      const storedProjects = parseStored<Project[]>(scoped(workspaceStorageKeys.projects), []);
      setProjects(storedProjects);
      setInspirationItems(parseStored<InspirationItem[]>(scoped(workspaceStorageKeys.inspiration), []));
      setResearchItems(parseStored<ResearchItem[]>(scoped(workspaceStorageKeys.research), []));
      setSavedIds(parseStored<string[]>(scoped(workspaceStorageKeys.savedItems), []));

      const storedActive = window.localStorage.getItem(scoped(workspaceStorageKeys.activeProject)) ?? "";
      setActiveProjectIdState(storedProjects.some((project) => project.id === storedActive) ? storedActive : storedProjects[0]?.id ?? "");
    }, 0);
    return () => window.clearTimeout(hydrateWorkspace);
  }, [workspaceUserId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileNavOpen(false);
        setProjectDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function createProject(input: NewProjectInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before creating a project.");
    const project: Project = {
      id: `project-${Date.now()}`,
      name: input.name.trim(),
      brand: input.brand.trim(),
      market: input.market.trim(),
      focus: input.description.trim(),
      description: input.description.trim(),
      competitors: input.competitors,
      accent: projectColors[projects.length % projectColors.length],
      counts: { mentions: 0, research: 0, insights: 0 },
    };
    const next = [...projects, project];
    setProjects(next);
    setActiveProjectIdState(project.id);
    window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.projects), JSON.stringify(next));
    window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), project.id);
    return project;
  }

  function addInspiration(input: NewInspirationInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before adding inspiration.");
    const item: InspirationItem = {
      id: `inspiration-${Date.now()}`,
      brand: "Personal workspace",
      title: input.title.trim(),
      type: input.type,
      source: input.source.trim() || "Personal note",
      tags: [],
      palette: "blue",
      savedAt: "Just now",
      note: input.note.trim(),
    };
    const next = [...inspirationItems, item];
    setInspirationItems(next);
    window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.inspiration), JSON.stringify(next));
    return item;
  }

  function addResearch(input: NewResearchInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before adding research.");
    const item: ResearchItem = {
      id: `research-${Date.now()}`,
      title: input.title.trim(),
      publication: input.source.trim() || "Personal research",
      type: input.type,
      date: new Date().toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" }),
      tags: [],
      summary: input.summary.trim(),
      collection: "Unsorted",
    };
    const next = [...researchItems, item];
    setResearchItems(next);
    window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.research), JSON.stringify(next));
    return item;
  }

  const value: AppContextValue = {
    collapsed,
    setCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
    theme,
    toggleTheme: () => {
      const next = theme === "light" ? "dark" : "light";
      setTheme(next);
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("sift-theme", next);
    },
    projects,
    createProject,
    projectDialogOpen,
    setProjectDialogOpen,
    activeProjectId,
    setActiveProjectId: (id) => {
      if (!workspaceUserId) return;
      setActiveProjectIdState(id);
      window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), id);
    },
    inspirationItems,
    addInspiration,
    researchItems,
    addResearch,
    savedIds,
    toggleSaved: (id) => {
      if (!workspaceUserId) return;
      setSavedIds((current) => {
        const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.savedItems), JSON.stringify(next));
        return next;
      });
    },
    removeSavedIds: (ids) => {
      if (!ids.length) return;
      const removed = new Set(ids);
      setSavedIds((current) => {
        const next = current.filter((id) => !removed.has(id));
        if (workspaceUserId) window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.savedItems), JSON.stringify(next));
        return next;
      });
    },
    searchOpen,
    setSearchOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
