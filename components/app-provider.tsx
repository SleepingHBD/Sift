"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { InspirationItem, Project, ResearchItem } from "@/lib/types";

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
      const storedProjects = parseStored<Project[]>("sift-user-projects-v1", []);
      setTheme(initialTheme);
      document.documentElement.dataset.theme = initialTheme;
      setProjects(storedProjects);
      setInspirationItems(parseStored<InspirationItem[]>("sift-user-inspiration-v1", []));
      setResearchItems(parseStored<ResearchItem[]>("sift-user-research-v1", []));
      setSavedIds(parseStored<string[]>("sift-saved-items-personal", []));

      const storedActive = window.localStorage.getItem("sift-active-project-personal") ?? "";
      setActiveProjectIdState(storedProjects.some((project) => project.id === storedActive) ? storedActive : storedProjects[0]?.id ?? "");
    }, 0);
    return () => window.clearTimeout(hydratePreferences);
  }, []);

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
    window.localStorage.setItem("sift-user-projects-v1", JSON.stringify(next));
    window.localStorage.setItem("sift-active-project-personal", project.id);
    return project;
  }

  function addInspiration(input: NewInspirationInput) {
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
    window.localStorage.setItem("sift-user-inspiration-v1", JSON.stringify(next));
    return item;
  }

  function addResearch(input: NewResearchInput) {
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
    window.localStorage.setItem("sift-user-research-v1", JSON.stringify(next));
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
      setActiveProjectIdState(id);
      window.localStorage.setItem("sift-active-project-personal", id);
    },
    inspirationItems,
    addInspiration,
    researchItems,
    addResearch,
    savedIds,
    toggleSaved: (id) => {
      setSavedIds((current) => {
        const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        window.localStorage.setItem("sift-saved-items-personal", JSON.stringify(next));
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
