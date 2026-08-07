"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { defaultRadarConnectorSettings, mergeRadarMentions, type RadarConnectorSettings } from "@/lib/radar/connector-service";
import type { MonitorRun, MonitoringQuery, RadarEvidenceLink, RadarMention } from "@/lib/radar/types";
import { prepareUserWorkspaceStorage, userWorkspaceStorageKey, workspaceStorageKeys } from "@/lib/workspace-storage";

const storageKeys = {
  monitors: workspaceStorageKeys.radarMonitors,
  mentions: workspaceStorageKeys.radarMentions,
  runs: workspaceStorageKeys.radarRuns,
  connectorSettings: workspaceStorageKeys.radarConnectorSettings,
  evidence: workspaceStorageKeys.radarEvidence,
  notes: workspaceStorageKeys.radarNotes,
  important: workspaceStorageKeys.radarImportant,
};

function read<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function useRadarState() {
  const { status, user } = useAuth();
  const workspaceUserId = status === "authenticated" ? user?.id ?? "" : "";
  const [monitors, setMonitors] = useState<MonitoringQuery[]>([]);
  const [mentionsByMonitor, setMentionsByMonitor] = useState<Record<string, RadarMention[]>>({});
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [connectorSettings, setConnectorSettings] = useState<RadarConnectorSettings>(defaultRadarConnectorSettings);
  const [evidenceLinks, setEvidenceLinks] = useState<RadarEvidenceLink[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [importantIds, setImportantIds] = useState<string[]>([]);

  function scopedKey(legacyKey: string) {
    return userWorkspaceStorageKey(workspaceUserId, legacyKey);
  }

  function persist(legacyKey: string, value: unknown) {
    if (!workspaceUserId) return;
    window.localStorage.setItem(scopedKey(legacyKey), JSON.stringify(value));
  }

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      setMonitors([]);
      setMentionsByMonitor({});
      setRuns([]);
      setConnectorSettings(defaultRadarConnectorSettings);
      setEvidenceLinks([]);
      setNotes({});
      setImportantIds([]);
      if (!workspaceUserId) return;

      prepareUserWorkspaceStorage(window.localStorage, workspaceUserId);
      setMonitors(read<MonitoringQuery[]>(userWorkspaceStorageKey(workspaceUserId, storageKeys.monitors), []));
      setMentionsByMonitor(read<Record<string, RadarMention[]>>(userWorkspaceStorageKey(workspaceUserId, storageKeys.mentions), {}));
      setRuns(read<MonitorRun[]>(userWorkspaceStorageKey(workspaceUserId, storageKeys.runs), []));
      setConnectorSettings(read<RadarConnectorSettings>(userWorkspaceStorageKey(workspaceUserId, storageKeys.connectorSettings), defaultRadarConnectorSettings));
      setEvidenceLinks(read<RadarEvidenceLink[]>(userWorkspaceStorageKey(workspaceUserId, storageKeys.evidence), []));
      setNotes(read<Record<string, string>>(userWorkspaceStorageKey(workspaceUserId, storageKeys.notes), {}));
      setImportantIds(read<string[]>(userWorkspaceStorageKey(workspaceUserId, storageKeys.important), []));
    }, 0);
    return () => window.clearTimeout(hydration);
  }, [workspaceUserId]);

  function addMonitor(monitor: MonitoringQuery) {
    if (!workspaceUserId) return;
    setMonitors((current) => {
      const next = [...current, monitor];
      persist(storageKeys.monitors, next);
      return next;
    });
  }

  function removeMonitor(monitorId: string) {
    if (!workspaceUserId) return;
    const mentionIds = new Set((mentionsByMonitor[monitorId] ?? []).map((mention) => mention.id));
    setMonitors((current) => {
      const next = current.filter((monitor) => monitor.id !== monitorId);
      persist(storageKeys.monitors, next);
      return next;
    });
    setMentionsByMonitor((current) => {
      const next = { ...current };
      delete next[monitorId];
      persist(storageKeys.mentions, next);
      return next;
    });
    setRuns((current) => {
      const next = current.filter((run) => run.monitorId !== monitorId);
      persist(storageKeys.runs, next);
      return next;
    });
    setEvidenceLinks((current) => {
      const next = current.filter((link) => !mentionIds.has(link.mentionId));
      persist(storageKeys.evidence, next);
      return next;
    });
    setNotes((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([mentionId]) => !mentionIds.has(mentionId)));
      persist(storageKeys.notes, next);
      return next;
    });
    setImportantIds((current) => {
      const next = current.filter((mentionId) => !mentionIds.has(mentionId));
      persist(storageKeys.important, next);
      return next;
    });
  }

  function saveConnectorSettings(settings: RadarConnectorSettings) {
    if (!workspaceUserId) return;
    const cleaned = {
      rssFeedUrls: uniqueHttpUrls(settings.rssFeedUrls),
      manualUrls: uniqueHttpUrls(settings.manualUrls),
      youtubeEnabled: settings.youtubeEnabled,
    };
    setConnectorSettings(cleaned);
    persist(storageKeys.connectorSettings, cleaned);
  }

  function completeMonitorRun(monitorId: string, mentions: RadarMention[], run: MonitorRun) {
    if (!workspaceUserId) return;
    setMentionsByMonitor((current) => {
      const merged = mergeRadarMentions(current[monitorId] ?? [], mentions);
      const next = { ...current, [monitorId]: merged };
      persist(storageKeys.mentions, next);
      return next;
    });
    setMonitors((current) => {
      const next = current.map((monitor) => monitor.id === monitorId
        ? { ...monitor, dataMode: mentions.length || monitor.dataMode === "live" ? "live" as const : "empty" as const, status: "active" as const, lastRunAt: run.completedAt }
        : monitor);
      persist(storageKeys.monitors, next);
      return next;
    });
    recordMonitorRun(run);
  }

  function recordMonitorRun(run: MonitorRun) {
    if (!workspaceUserId) return;
    setRuns((current) => {
      const next = [run, ...current].slice(0, 100);
      persist(storageKeys.runs, next);
      return next;
    });
  }

  function addEvidenceLink(link: RadarEvidenceLink) {
    if (!workspaceUserId) return;
    setEvidenceLinks((current) => {
      const next = [...current.filter((item) => !(item.mentionId === link.mentionId && item.destination === link.destination && item.destinationId === link.destinationId)), link];
      persist(storageKeys.evidence, next);
      return next;
    });
  }

  function saveNote(mentionId: string, note: string) {
    if (!workspaceUserId) return;
    setNotes((current) => {
      const next = { ...current, [mentionId]: note };
      persist(storageKeys.notes, next);
      return next;
    });
  }

  function toggleImportant(mentionId: string) {
    if (!workspaceUserId) return;
    setImportantIds((current) => {
      const next = current.includes(mentionId) ? current.filter((id) => id !== mentionId) : [...current, mentionId];
      persist(storageKeys.important, next);
      return next;
    });
  }

  return {
    monitors,
    addMonitor,
    removeMonitor,
    mentionsByMonitor,
    runs,
    connectorSettings,
    saveConnectorSettings,
    completeMonitorRun,
    recordMonitorRun,
    evidenceLinks,
    addEvidenceLink,
    notes,
    saveNote,
    importantIds,
    toggleImportant,
  };
}

function uniqueHttpUrls(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => /^https?:\/\//i.test(value)))];
}
