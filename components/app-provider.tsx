"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  createCloudInspiration,
  deleteCloudInspiration,
  importLocalInspiration,
  listCloudInspiration,
} from "@/lib/inspiration/repository";
import {
  createCloudProject,
  deleteCloudProject,
  importLocalProjects,
  listCloudProjects,
  setCloudProjectArchived,
  updateCloudProject,
} from "@/lib/projects/repository";
import {
  createCloudFileResearch,
  createCloudResearch,
  createCloudSocialResearch,
  deleteCloudResearch,
  importLocalResearch,
  listCloudResearch,
} from "@/lib/research/repository";
import type { InspirationItem, Project, ResearchItem } from "@/lib/types";
import {
  clearMigratedLibraryStorage,
  clearMigratedProjectStorage,
  prepareUserWorkspaceStorage,
  userWorkspaceStorageKey,
  workspaceStorageKeys,
} from "@/lib/workspace-storage";
import { describeWorkspaceError } from "@/lib/workspace-error";
import type { EvidenceCaptureMethod } from "@/lib/evidence/reference";
import type { EvidenceCaptureDialogMode } from "@/lib/evidence/capture";
import type { EvidenceUrlMetadata } from "@/lib/evidence/url-extraction";
import type { SocialPlatform } from "@/lib/evidence/social-capture";
import { createStrategyWorkingSession, type StrategyWorkingSession } from "@/lib/strategy-ai/session";

type Theme = "light" | "dark";
export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface NewProjectInput {
  name: string;
  brand: string;
  market: string;
  description: string;
  competitors: string[];
}

export interface NewInspirationInput {
  projectId: string;
  title: string;
  type: string;
  source: string;
  note: string;
}

export interface NewResearchInput {
  projectId: string;
  title: string;
  type: string;
  source: string;
  summary: string;
  sourceText?: string;
  captureMethod?: EvidenceCaptureMethod;
  captureOrigin?: "research_form" | "global_capture";
  urlMetadata?: EvidenceUrlMetadata;
}

export interface NewResearchFileInput {
  projectId: string;
  title: string;
  summary: string;
  file: File;
  captureOrigin?: "research_form" | "global_capture";
}

export interface NewSocialResearchInput {
  projectId: string;
  title: string;
  url: string;
  platform: SocialPlatform;
  author?: string;
  caption?: string;
  selectedComments?: string;
  observedAt?: string;
  summary: string;
  screenshot?: File;
  urlMetadata?: EvidenceUrlMetadata;
}

interface AppContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  theme: Theme;
  toggleTheme: () => void;
  projects: Project[];
  archivedProjects: Project[];
  createProject: (input: NewProjectInput) => Promise<Project>;
  updateProject: (id: string, input: NewProjectInput) => Promise<Project>;
  archiveProject: (id: string) => Promise<void>;
  restoreProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  projectDialogOpen: boolean;
  setProjectDialogOpen: (value: boolean) => void;
  editingProject: Project | null;
  openProjectEditor: (id: string) => void;
  workspaceStatus: WorkspaceStatus;
  workspaceError: string;
  clearWorkspaceError: () => void;
  retryWorkspace: () => void;
  pendingProjectImports: Project[];
  importPendingProjects: () => Promise<number>;
  pendingInspirationImports: InspirationItem[];
  importPendingInspiration: (projectId: string) => Promise<number>;
  pendingResearchImports: ResearchItem[];
  importPendingResearch: (projectId: string) => Promise<number>;
  activeProjectId: string;
  setActiveProjectId: (value: string) => void;
  inspirationItems: InspirationItem[];
  addInspiration: (input: NewInspirationInput) => Promise<InspirationItem>;
  deleteInspiration: (id: string) => Promise<void>;
  researchItems: ResearchItem[];
  addResearch: (input: NewResearchInput) => Promise<ResearchItem>;
  addResearchFile: (input: NewResearchFileInput) => Promise<ResearchItem>;
  addSocialResearch: (input: NewSocialResearchInput) => Promise<ResearchItem>;
  deleteResearch: (id: string) => Promise<void>;
  savedIds: string[];
  toggleSaved: (id: string) => void;
  removeSavedIds: (ids: string[]) => void;
  searchOpen: boolean;
  setSearchOpen: (value: boolean) => void;
  captureDialogOpen: boolean;
  captureDialogMode: EvidenceCaptureDialogMode;
  openCaptureDialog: (mode?: EvidenceCaptureDialogMode) => void;
  setCaptureDialogOpen: (value: boolean) => void;
  strategySession: StrategyWorkingSession;
  setStrategySession: Dispatch<SetStateAction<StrategyWorkingSession>>;
}

const AppContext = createContext<AppContextValue | null>(null);

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
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [inspirationItems, setInspirationItems] = useState<InspirationItem[]>([]);
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [projectDialogOpen, setProjectDialogOpenState] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [captureDialogMode, setCaptureDialogMode] = useState<EvidenceCaptureDialogMode>("url");
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("idle");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceReloadToken, setWorkspaceReloadToken] = useState(0);
  const [pendingProjectImports, setPendingProjectImports] = useState<Project[]>([]);
  const [pendingInspirationImports, setPendingInspirationImports] = useState<InspirationItem[]>([]);
  const [pendingResearchImports, setPendingResearchImports] = useState<ResearchItem[]>([]);
  const [strategySession, setStrategySession] = useState<StrategyWorkingSession>(() => createStrategyWorkingSession());

  const projects = useMemo(() => allProjects.filter((project) => project.status !== "archived"), [allProjects]);
  const archivedProjects = useMemo(() => allProjects.filter((project) => project.status === "archived"), [allProjects]);
  const editingProject = allProjects.find((project) => project.id === editingProjectId) ?? null;

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
    const resetStrategySession = window.setTimeout(() => {
      setStrategySession(createStrategyWorkingSession(workspaceUserId));
    }, 0);
    return () => window.clearTimeout(resetStrategySession);
  }, [workspaceUserId]);

  useEffect(() => {
    let active = true;
    const hydrateWorkspace = window.setTimeout(() => {
      setAllProjects([]);
      setInspirationItems([]);
      setResearchItems([]);
      setSavedIds([]);
      setActiveProjectIdState("");
      setProjectDialogOpenState(false);
      setEditingProjectId("");
      setSearchOpen(false);
      setCaptureDialogOpen(false);
      setPendingProjectImports([]);
      setPendingInspirationImports([]);
      setPendingResearchImports([]);
      setWorkspaceError("");

      if (!workspaceUserId) {
        setWorkspaceStatus("idle");
        return;
      }

      prepareUserWorkspaceStorage(window.localStorage, workspaceUserId);
      const scoped = (legacyKey: string) => userWorkspaceStorageKey(workspaceUserId, legacyKey);
      const localProjects = parseStored<Project[]>(scoped(workspaceStorageKeys.projects), []);
      const localInspiration = parseStored<InspirationItem[]>(scoped(workspaceStorageKeys.inspiration), []);
      const localResearch = parseStored<ResearchItem[]>(scoped(workspaceStorageKeys.research), []);
      setSavedIds(parseStored<string[]>(scoped(workspaceStorageKeys.savedItems), []));
      setWorkspaceStatus("loading");

      void listCloudProjects().then(async (cloudProjects) => {
        const [cloudResearch, cloudInspiration] = await Promise.all([
          listCloudResearch(cloudProjects),
          listCloudInspiration(cloudProjects),
        ]);
        if (!active) return;
        const cloudProjectRefs = new Set(cloudProjects.map((project) => project.clientRef ?? project.id));
        const cloudResearchRefs = new Set(cloudResearch.map((item) => item.clientRef ?? item.id));
        const cloudInspirationRefs = new Set(cloudInspiration.map((item) => item.clientRef ?? item.id));
        const pendingProjects = localProjects.filter((project) => !cloudProjectRefs.has(project.clientRef ?? project.id));
        const pendingResearch = localResearch.filter((item) => !cloudResearchRefs.has(item.clientRef ?? item.id));
        const pendingInspiration = localInspiration.filter((item) => !cloudInspirationRefs.has(item.clientRef ?? item.id));
        const activeCloudProjects = cloudProjects.filter((project) => project.status !== "archived");
        const storedActive = window.localStorage.getItem(scoped(workspaceStorageKeys.activeProject)) ?? "";
        setAllProjects(cloudProjects);
        setResearchItems(cloudResearch);
        setInspirationItems(cloudInspiration);
        setPendingProjectImports(pendingProjects);
        setPendingResearchImports(pendingResearch);
        setPendingInspirationImports(pendingInspiration);
        setActiveProjectIdState(activeCloudProjects.some((project) => project.id === storedActive) ? storedActive : activeCloudProjects[0]?.id ?? "");
        if (!pendingProjects.length && localProjects.length) clearMigratedProjectStorage(window.localStorage, workspaceUserId);
        if (!pendingResearch.length && localResearch.length) clearMigratedLibraryStorage(window.localStorage, workspaceUserId, "research");
        if (!pendingInspiration.length && localInspiration.length) clearMigratedLibraryStorage(window.localStorage, workspaceUserId, "inspiration");
        setWorkspaceStatus("ready");
      }).catch((loadError: unknown) => {
        if (!active) return;
        setPendingProjectImports(localProjects);
        setPendingResearchImports(localResearch);
        setPendingInspirationImports(localInspiration);
        setWorkspaceError(describeWorkspaceError(loadError));
        setWorkspaceStatus("error");
      });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(hydrateWorkspace);
    };
  }, [workspaceReloadToken, workspaceUserId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileNavOpen(false);
        setProjectDialogOpenState(false);
        setEditingProjectId("");
        setCaptureDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function runWorkspaceMutation<T>(operation: () => Promise<T>) {
    setWorkspaceError("");
    try {
      return await operation();
    } catch (mutationError) {
      const message = describeWorkspaceError(mutationError);
      setWorkspaceError(message);
      throw new Error(message, { cause: mutationError });
    }
  }

  async function createProject(input: NewProjectInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before creating a project.");
    return runWorkspaceMutation(async () => {
      const project = await createCloudProject(input);
      setAllProjects((current) => [...current, project]);
      setActiveProjectIdState(project.id);
      window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), project.id);
      return project;
    });
  }

  async function updateProject(id: string, input: NewProjectInput) {
    const project = allProjects.find((item) => item.id === id);
    if (!project) throw new Error("The project could not be found.");
    return runWorkspaceMutation(async () => {
      const updated = await updateCloudProject(project, input);
      setAllProjects((current) => current.map((item) => item.id === id ? updated : item));
      return updated;
    });
  }

  async function changeProjectArchiveState(id: string, archived: boolean) {
    const project = allProjects.find((item) => item.id === id);
    if (!project) throw new Error("The project could not be found.");
    await runWorkspaceMutation(async () => {
      const updated = await setCloudProjectArchived(project, archived);
      setAllProjects((current) => current.map((item) => item.id === id ? updated : item));
      if (archived && activeProjectId === id) {
        const nextActive = projects.find((item) => item.id !== id)?.id ?? "";
        setActiveProjectIdState(nextActive);
        window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), nextActive);
      } else if (!archived && !activeProjectId) {
        setActiveProjectIdState(id);
        window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), id);
      }
    });
  }

  async function deleteProject(id: string) {
    const project = allProjects.find((item) => item.id === id);
    if (!project) throw new Error("The project could not be found.");
    await runWorkspaceMutation(async () => {
      await deleteCloudProject(project);
      setAllProjects((current) => current.filter((item) => item.id !== id));
      setResearchItems((current) => current.filter((item) => item.projectId !== id));
      setInspirationItems((current) => current.filter((item) => item.projectId !== id));
      if (activeProjectId === id) {
        const nextActive = projects.find((item) => item.id !== id)?.id ?? "";
        setActiveProjectIdState(nextActive);
        window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), nextActive);
      }
    });
  }

  async function importPendingProjects() {
    if (!workspaceUserId || !pendingProjectImports.length) return 0;
    setWorkspaceStatus("loading");
    setWorkspaceError("");
    try {
      const importedProjects = await importLocalProjects(pendingProjectImports);
      const importedCount = pendingProjectImports.length;
      setAllProjects(importedProjects);
      setPendingProjectImports([]);
      clearMigratedProjectStorage(window.localStorage, workspaceUserId);
      if (!activeProjectId) {
        const firstActive = importedProjects.find((project) => project.status !== "archived")?.id ?? "";
        setActiveProjectIdState(firstActive);
      }
      setWorkspaceStatus("ready");
      return importedCount;
    } catch (importError) {
      const message = describeWorkspaceError(importError);
      setWorkspaceError(message);
      setWorkspaceStatus("error");
      throw new Error(message, { cause: importError });
    }
  }

  async function addInspiration(input: NewInspirationInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before adding inspiration.");
    const project = projects.find((item) => item.id === input.projectId);
    if (!project) throw new Error("Choose a project before saving inspiration.");
    return runWorkspaceMutation(async () => {
      const item = await createCloudInspiration(project, input);
      setInspirationItems((current) => [item, ...current]);
      return item;
    });
  }

  async function deleteInspiration(id: string) {
    const item = inspirationItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error("The inspiration item could not be found.");
    const project = projects.find((candidate) => candidate.id === item.projectId);
    if (!project?.cloudId) throw new Error("The source project is not available in the cloud.");
    const cloudProjectId = project.cloudId;
    await runWorkspaceMutation(async () => {
      await deleteCloudInspiration(item, cloudProjectId);
      setInspirationItems((current) => current.filter((candidate) => candidate.id !== id));
      setSavedIds((current) => {
        const next = current.filter((savedId) => savedId !== id);
        window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.savedItems), JSON.stringify(next));
        return next;
      });
    });
  }

  async function addResearch(input: NewResearchInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before adding research.");
    const project = projects.find((item) => item.id === input.projectId);
    if (!project) throw new Error("Choose a project before saving research.");
    return runWorkspaceMutation(async () => {
      const item = await createCloudResearch(project, input);
      setResearchItems((current) => [item, ...current]);
      setAllProjects((current) => current.map((candidate) => candidate.id === project.id
        ? { ...candidate, counts: { ...candidate.counts, research: candidate.counts.research + 1 } }
        : candidate));
      return item;
    });
  }

  async function addResearchFile(input: NewResearchFileInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before uploading evidence.");
    const project = projects.find((item) => item.id === input.projectId);
    if (!project) throw new Error("Choose a project before uploading evidence.");
    return runWorkspaceMutation(async () => {
      const item = await createCloudFileResearch(project, workspaceUserId, input);
      setResearchItems((current) => [item, ...current]);
      setAllProjects((current) => current.map((candidate) => candidate.id === project.id
        ? { ...candidate, counts: { ...candidate.counts, research: candidate.counts.research + 1 } }
        : candidate));
      return item;
    });
  }

  async function addSocialResearch(input: NewSocialResearchInput) {
    if (!workspaceUserId) throw new Error("Sign in with GitHub before capturing social evidence.");
    const project = projects.find((item) => item.id === input.projectId);
    if (!project) throw new Error("Choose a project before capturing social evidence.");
    return runWorkspaceMutation(async () => {
      const item = await createCloudSocialResearch(project, workspaceUserId, input);
      setResearchItems((current) => [item, ...current]);
      setAllProjects((current) => current.map((candidate) => candidate.id === project.id
        ? { ...candidate, counts: { ...candidate.counts, research: candidate.counts.research + 1 } }
        : candidate));
      return item;
    });
  }

  async function deleteResearch(id: string) {
    const item = researchItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error("The research item could not be found.");
    const project = projects.find((candidate) => candidate.id === item.projectId);
    if (!project?.cloudId) throw new Error("The source project is not available in the cloud.");
    const cloudProjectId = project.cloudId;
    await runWorkspaceMutation(async () => {
      const cleanupWarning = await deleteCloudResearch(item, cloudProjectId);
      setResearchItems((current) => current.filter((candidate) => candidate.id !== id));
      setAllProjects((current) => current.map((candidate) => candidate.id === item.projectId
        ? { ...candidate, counts: { ...candidate.counts, research: Math.max(0, candidate.counts.research - 1) } }
        : candidate));
      if (cleanupWarning) setWorkspaceError(cleanupWarning);
    });
  }

  async function importPendingResearch(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!workspaceUserId || !project || !pendingResearchImports.length) return 0;
    return runWorkspaceMutation(async () => {
      await importLocalResearch(pendingResearchImports, project);
      const importedCount = pendingResearchImports.length;
      const cloudResearch = await listCloudResearch(allProjects);
      setResearchItems(cloudResearch);
      setAllProjects((current) => current.map((candidate) => candidate.id === project.id
        ? { ...candidate, counts: { ...candidate.counts, research: cloudResearch.filter((item) => item.projectId === project.id).length } }
        : candidate));
      setPendingResearchImports([]);
      clearMigratedLibraryStorage(window.localStorage, workspaceUserId, "research");
      return importedCount;
    });
  }

  async function importPendingInspiration(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!workspaceUserId || !project || !pendingInspirationImports.length) return 0;
    return runWorkspaceMutation(async () => {
      await importLocalInspiration(pendingInspirationImports, project);
      const importedCount = pendingInspirationImports.length;
      setInspirationItems(await listCloudInspiration(allProjects));
      setPendingInspirationImports([]);
      clearMigratedLibraryStorage(window.localStorage, workspaceUserId, "inspiration");
      return importedCount;
    });
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
    archivedProjects,
    createProject,
    updateProject,
    archiveProject: (id) => changeProjectArchiveState(id, true),
    restoreProject: (id) => changeProjectArchiveState(id, false),
    deleteProject,
    projectDialogOpen,
    setProjectDialogOpen: (value) => {
      setProjectDialogOpenState(value);
      setEditingProjectId("");
    },
    editingProject,
    openProjectEditor: (id) => {
      setEditingProjectId(id);
      setProjectDialogOpenState(true);
    },
    workspaceStatus,
    workspaceError,
    clearWorkspaceError: () => setWorkspaceError(""),
    retryWorkspace: () => setWorkspaceReloadToken((token) => token + 1),
    pendingProjectImports,
    importPendingProjects,
    pendingInspirationImports,
    importPendingInspiration,
    pendingResearchImports,
    importPendingResearch,
    activeProjectId,
    setActiveProjectId: (id) => {
      if (!workspaceUserId) return;
      setActiveProjectIdState(id);
      window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, workspaceStorageKeys.activeProject), id);
    },
    inspirationItems,
    addInspiration,
    deleteInspiration,
    researchItems,
    addResearch,
    addResearchFile,
    addSocialResearch,
    deleteResearch,
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
    captureDialogOpen,
    captureDialogMode,
    openCaptureDialog: (mode = "url") => {
      setCaptureDialogMode(mode);
      setCaptureDialogOpen(true);
    },
    setCaptureDialogOpen,
    strategySession,
    setStrategySession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
