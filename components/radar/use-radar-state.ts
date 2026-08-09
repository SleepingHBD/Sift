"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  createCloudEvidenceLink,
  deleteCloudEvidenceLink,
  importLocalRadarAnnotations,
  listCloudRadarAnnotations,
  listCloudRadarAnnotationsForMentions,
  saveCloudMentionNote,
  setCloudMentionImportant,
  setCloudMentionSaved,
  type LocalRadarAnnotationPayload,
  type RadarAnnotationContext,
  type RadarAnnotationSnapshot,
} from "@/lib/radar/annotation-repository";
import { defaultRadarConnectorSettings, mergeRadarMentions, type RadarConnectorSettings } from "@/lib/radar/connector-service";
import { createCloudMonitor, importLocalRadar, listCloudRadar, saveCloudMonitorRun, updateCloudMonitor, type LocalRadarPayload, type RadarCloudSnapshot } from "@/lib/radar/repository";
import type { MonitorRun, MonitoringQuery, RadarEvidenceLink, RadarMention } from "@/lib/radar/types";
import type { InspirationItem, Project, ResearchItem } from "@/lib/types";
import {
  clearMigratedRadarAnnotationStorage,
  clearMigratedRadarStorage,
  prepareUserWorkspaceStorage,
  userWorkspaceStorageKey,
  workspaceStorageKeys,
} from "@/lib/workspace-storage";
import { describeWorkspaceError } from "@/lib/workspace-error";

const storageKeys = {
  monitors: workspaceStorageKeys.radarMonitors,
  mentions: workspaceStorageKeys.radarMentions,
  runs: workspaceStorageKeys.radarRuns,
  connectorSettings: workspaceStorageKeys.radarConnectorSettings,
  evidence: workspaceStorageKeys.radarEvidence,
  notes: workspaceStorageKeys.radarNotes,
  important: workspaceStorageKeys.radarImportant,
  saved: workspaceStorageKeys.savedItems,
};

function read<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function localRadarPayload(userId: string): LocalRadarPayload | null {
  const payload = {
    monitors: read<MonitoringQuery[]>(userWorkspaceStorageKey(userId, storageKeys.monitors), []),
    mentionsByMonitor: read<Record<string, RadarMention[]>>(userWorkspaceStorageKey(userId, storageKeys.mentions), {}),
    runs: read<MonitorRun[]>(userWorkspaceStorageKey(userId, storageKeys.runs), []),
  };
  return payload.monitors.length || Object.values(payload.mentionsByMonitor).some((items) => items.length) || payload.runs.length ? payload : null;
}

function localRadarAnnotations(userId: string, validMentionIds: Set<string>): LocalRadarAnnotationPayload | null {
  const evidenceLinks = read<RadarEvidenceLink[]>(userWorkspaceStorageKey(userId, storageKeys.evidence), [])
    .filter((link) => validMentionIds.has(link.mentionId));
  const notes = Object.fromEntries(
    Object.entries(read<Record<string, string>>(userWorkspaceStorageKey(userId, storageKeys.notes), {}))
      .filter(([mentionId, note]) => validMentionIds.has(mentionId) && note.trim()),
  );
  const importantIds = read<string[]>(userWorkspaceStorageKey(userId, storageKeys.important), [])
    .filter((mentionId) => validMentionIds.has(mentionId));
  const savedIds = read<string[]>(userWorkspaceStorageKey(userId, storageKeys.saved), [])
    .filter((mentionId) => validMentionIds.has(mentionId));
  const payload = { savedIds, importantIds, notes, evidenceLinks };
  return savedIds.length || importantIds.length || Object.keys(notes).length || evidenceLinks.length ? payload : null;
}

function mentionIdsFrom(...collections: Array<Record<string, RadarMention[]> | undefined>) {
  return new Set(collections.flatMap((collection) => Object.values(collection ?? {}).flat().map((mention) => mention.id)));
}

export function useRadarState(
  projects: Project[],
  researchItems: ResearchItem[],
  inspirationItems: InspirationItem[],
  onLocalSavedIdsMigrated?: (ids: string[]) => void,
) {
  const { status: authStatus, user } = useAuth();
  const workspaceUserId = authStatus === "authenticated" ? user?.id ?? "" : "";
  const annotationContext: RadarAnnotationContext = { projects, researchItems, inspirationItems };
  const [monitors, setMonitors] = useState<MonitoringQuery[]>([]);
  const [mentionsByMonitor, setMentionsByMonitor] = useState<Record<string, RadarMention[]>>({});
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [connectorSettings, setConnectorSettings] = useState<RadarConnectorSettings>(defaultRadarConnectorSettings);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [evidenceLinks, setEvidenceLinks] = useState<RadarEvidenceLink[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [importantIds, setImportantIds] = useState<string[]>([]);
  const [cloudStatus, setCloudStatus] = useState<"loading" | "ready" | "error">("loading");
  const [cloudError, setCloudError] = useState("");
  const [annotationError, setAnnotationError] = useState("");
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const [pendingLocalRadar, setPendingLocalRadar] = useState<LocalRadarPayload | null>(null);
  const [pendingLocalAnnotations, setPendingLocalAnnotations] = useState<LocalRadarAnnotationPayload | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const scopedKey = useCallback((legacyKey: string) => userWorkspaceStorageKey(workspaceUserId, legacyKey), [workspaceUserId]);
  const persist = useCallback((legacyKey: string, value: unknown) => {
    if (workspaceUserId) window.localStorage.setItem(userWorkspaceStorageKey(workspaceUserId, legacyKey), JSON.stringify(value));
  }, [workspaceUserId]);

  const applySnapshot = useCallback((snapshot: RadarCloudSnapshot) => {
    setMonitors(snapshot.monitors);
    setMentionsByMonitor(snapshot.mentionsByMonitor);
    setRuns(snapshot.runs);
    setHistoryTruncated(snapshot.truncated);
  }, []);

  const applyAnnotationSnapshot = useCallback((snapshot: RadarAnnotationSnapshot) => {
    setSavedIds(snapshot.savedIds);
    setEvidenceLinks(snapshot.evidenceLinks);
    setNotes(snapshot.notes);
    setImportantIds(snapshot.importantIds);
  }, []);

  const refreshCloud = useCallback(async () => {
    if (!workspaceUserId) return;
    const snapshot = await listCloudRadar(projects);
    const annotations = await listCloudRadarAnnotations(snapshot.mentionsByMonitor);
    applySnapshot(snapshot);
    applyAnnotationSnapshot(annotations);
  }, [applyAnnotationSnapshot, applySnapshot, projects, workspaceUserId]);

  const registerCloudMentions = useCallback(async (incoming: RadarMention[]) => {
    if (!incoming.length) return;
    setMentionsByMonitor((current) => {
      const next = { ...current };
      for (const mention of incoming) {
        next[mention.monitorId] = mergeRadarMentions(next[mention.monitorId] ?? [], [mention]);
      }
      return next;
    });
    try {
      const annotations = await listCloudRadarAnnotationsForMentions(incoming);
      setSavedIds((current) => [...new Set([...current, ...annotations.savedIds])]);
      setImportantIds((current) => [...new Set([...current, ...annotations.importantIds])]);
      setNotes((current) => ({ ...current, ...annotations.notes }));
      setEvidenceLinks((current) => {
        const next = new Map(current.map((link) => [link.id, link]));
        annotations.evidenceLinks.forEach((link) => next.set(link.id, link));
        return [...next.values()];
      });
    } catch (error) {
      setAnnotationError(error instanceof Error ? error.message : "Conversation annotations could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      setMonitors([]);
      setMentionsByMonitor({});
      setRuns([]);
      setSavedIds([]);
      setEvidenceLinks([]);
      setNotes({});
      setImportantIds([]);
      setHistoryTruncated(false);
      setCloudError("");
      setAnnotationError("");
      setPendingLocalRadar(null);
      setPendingLocalAnnotations(null);
      if (!workspaceUserId) {
        setCloudStatus(authStatus === "loading" ? "loading" : "ready");
        return;
      }

      prepareUserWorkspaceStorage(window.localStorage, workspaceUserId);
      setConnectorSettings(read<RadarConnectorSettings>(scopedKey(storageKeys.connectorSettings), defaultRadarConnectorSettings));
      const localCore = localRadarPayload(workspaceUserId);
      setPendingLocalRadar(localCore);
      setCloudStatus("loading");
      try {
        const snapshot = await listCloudRadar(projects);
        const annotations = await listCloudRadarAnnotations(snapshot.mentionsByMonitor);
        if (cancelled) return;
        applySnapshot(snapshot);
        applyAnnotationSnapshot(annotations);
        setPendingLocalAnnotations(localRadarAnnotations(
          workspaceUserId,
          mentionIdsFrom(snapshot.mentionsByMonitor, localCore?.mentionsByMonitor),
        ));
        setCloudStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setCloudError(describeWorkspaceError(error));
        setCloudStatus("error");
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [applyAnnotationSnapshot, applySnapshot, authStatus, projects, reloadToken, scopedKey, workspaceUserId]);

  function findMention(mentionId: string) {
    return Object.values(mentionsByMonitor).flat().find((mention) => mention.id === mentionId);
  }

  async function addMonitor(monitor: MonitoringQuery) {
    const created = await createCloudMonitor(monitor, projects);
    setMonitors((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    setMentionsByMonitor((current) => ({ ...current, [created.id]: current[created.id] ?? [] }));
    return created;
  }

  async function editMonitor(monitor: MonitoringQuery) {
    const updated = await updateCloudMonitor(monitor, projects);
    setMonitors((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }

  function removeMonitor(monitorId: string) {
    const mentionIds = new Set((mentionsByMonitor[monitorId] ?? []).map((mention) => mention.id));
    setMonitors((current) => current.filter((monitor) => monitor.id !== monitorId));
    setMentionsByMonitor((current) => { const next = { ...current }; delete next[monitorId]; return next; });
    setRuns((current) => current.filter((run) => run.monitorId !== monitorId));
    setSavedIds((current) => current.filter((mentionId) => !mentionIds.has(mentionId)));
    setEvidenceLinks((current) => current.filter((link) => !mentionIds.has(link.mentionId)));
    setNotes((current) => Object.fromEntries(Object.entries(current).filter(([mentionId]) => !mentionIds.has(mentionId))));
    setImportantIds((current) => current.filter((mentionId) => !mentionIds.has(mentionId)));
  }

  function saveConnectorSettings(settings: RadarConnectorSettings) {
    const cleaned = { rssFeedUrls: uniqueHttpUrls(settings.rssFeedUrls), manualUrls: uniqueHttpUrls(settings.manualUrls), youtubeEnabled: settings.youtubeEnabled };
    setConnectorSettings(cleaned);
    persist(storageKeys.connectorSettings, cleaned);
  }

  async function completeMonitorRun(monitorId: string, mentions: RadarMention[], run: MonitorRun) {
    if (run.persisted) {
      await refreshCloud();
      return;
    }
    setMentionsByMonitor((current) => ({ ...current, [monitorId]: mergeRadarMentions(current[monitorId] ?? [], mentions) }));
    setMonitors((current) => current.map((monitor) => monitor.id === monitorId ? { ...monitor, dataMode: mentions.length ? "live" : monitor.dataMode, status: "active", lastRunAt: run.completedAt } : monitor));
    setRuns((current) => [run, ...current].slice(0, 100));
  }

  async function recordMonitorRun(run: MonitorRun) {
    const monitor = monitors.find((item) => item.id === run.monitorId);
    setRuns((current) => [run, ...current].slice(0, 100));
    if (monitor) await saveCloudMonitorRun(run, monitor);
  }

  async function importPendingRadar() {
    if (!pendingLocalRadar && !pendingLocalAnnotations) return 0;
    const snapshot = pendingLocalRadar
      ? await importLocalRadar(pendingLocalRadar, projects)
      : await listCloudRadar(projects);
    const annotations = pendingLocalAnnotations
      ? await importLocalRadarAnnotations(pendingLocalAnnotations, snapshot.mentionsByMonitor, annotationContext)
      : await listCloudRadarAnnotations(snapshot.mentionsByMonitor);
    applySnapshot(snapshot);
    applyAnnotationSnapshot(annotations);

    if (pendingLocalRadar) clearMigratedRadarStorage(window.localStorage, workspaceUserId);
    if (pendingLocalAnnotations) {
      const migratedMentionIds = [...mentionIdsFrom(snapshot.mentionsByMonitor)];
      clearMigratedRadarAnnotationStorage(window.localStorage, workspaceUserId, migratedMentionIds);
      onLocalSavedIdsMigrated?.(pendingLocalAnnotations.savedIds);
    }
    const count = (pendingLocalRadar?.monitors.length ?? 0)
      + (pendingLocalAnnotations?.savedIds.length ?? 0)
      + (pendingLocalAnnotations?.importantIds.length ?? 0)
      + Object.keys(pendingLocalAnnotations?.notes ?? {}).length
      + (pendingLocalAnnotations?.evidenceLinks.length ?? 0);
    setPendingLocalRadar(null);
    setPendingLocalAnnotations(null);
    setCloudStatus("ready");
    return count;
  }

  async function toggleSaved(mentionId: string) {
    const mention = findMention(mentionId);
    if (!mention) return;
    const nextSaved = !savedIds.includes(mentionId);
    setAnnotationError("");
    try {
      await setCloudMentionSaved(mention, nextSaved);
      setSavedIds((current) => nextSaved ? [...new Set([...current, mentionId])] : current.filter((id) => id !== mentionId));
    } catch (error) {
      setAnnotationError(error instanceof Error ? error.message : "The saved marker could not be updated.");
    }
  }

  async function addEvidenceLink(link: RadarEvidenceLink) {
    const mention = findMention(link.mentionId);
    if (!mention) throw new Error("The source mention is no longer available.");
    setAnnotationError("");
    try {
      const created = await createCloudEvidenceLink(mention, link, annotationContext);
      if (!created) throw new Error("The evidence relationship could not be read after saving.");
      setEvidenceLinks((current) => [
        ...current.filter((item) => !(item.mentionId === created.mentionId && item.destination === created.destination && item.destinationCloudId === created.destinationCloudId)),
        created,
      ]);
      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evidence could not be linked.";
      setAnnotationError(message);
      throw new Error(message);
    }
  }

  async function removeEvidenceLink(link: RadarEvidenceLink) {
    setAnnotationError("");
    try {
      await deleteCloudEvidenceLink(link);
      setEvidenceLinks((current) => current.filter((item) => item.id !== link.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evidence relationship could not be removed.";
      setAnnotationError(message);
      throw new Error(message);
    }
  }

  async function saveNote(mentionId: string, note: string) {
    const mention = findMention(mentionId);
    if (!mention) throw new Error("The source mention is no longer available.");
    setAnnotationError("");
    try {
      await saveCloudMentionNote(mention, note);
      setNotes((current) => {
        const next = { ...current };
        if (note.trim()) next[mentionId] = note.trim();
        else delete next[mentionId];
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The note could not be saved.";
      setAnnotationError(message);
      throw new Error(message);
    }
  }

  async function toggleImportant(mentionId: string) {
    const mention = findMention(mentionId);
    if (!mention) return;
    const nextImportant = !importantIds.includes(mentionId);
    setAnnotationError("");
    try {
      await setCloudMentionImportant(mention, nextImportant);
      setImportantIds((current) => nextImportant ? [...new Set([...current, mentionId])] : current.filter((id) => id !== mentionId));
      setMentionsByMonitor((current) => Object.fromEntries(Object.entries(current).map(([monitorId, mentions]) => [
        monitorId,
        mentions.map((item) => item.id === mentionId ? { ...item, isImportant: nextImportant } : item),
      ])));
    } catch (error) {
      setAnnotationError(error instanceof Error ? error.message : "Importance could not be updated.");
    }
  }

  return {
    monitors,
    addMonitor,
    editMonitor,
    removeMonitor,
    mentionsByMonitor,
    registerCloudMentions,
    runs,
    connectorSettings,
    saveConnectorSettings,
    completeMonitorRun,
    recordMonitorRun,
    savedIds,
    toggleSaved,
    evidenceLinks,
    addEvidenceLink,
    removeEvidenceLink,
    notes,
    saveNote,
    importantIds,
    toggleImportant,
    annotationError,
    clearAnnotationError: () => setAnnotationError(""),
    cloudStatus,
    cloudError,
    retryCloud: () => setReloadToken((value) => value + 1),
    historyTruncated,
    pendingLocalRadar,
    pendingLocalAnnotations,
    importPendingRadar,
  };
}

function uniqueHttpUrls(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => /^https?:\/\//i.test(value)))];
}
