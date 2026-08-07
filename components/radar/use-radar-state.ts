"use client";

import { useEffect, useState } from "react";
import { defaultRadarConnectorSettings, mergeRadarMentions, type RadarConnectorSettings } from "@/lib/radar/connector-service";
import type { MonitorRun, MonitoringQuery, RadarEvidenceLink, RadarMention } from "@/lib/radar/types";

const storageKeys = {
  monitors: "sift-radar-monitors-v2",
  mentions: "sift-radar-mentions-v1",
  runs: "sift-radar-runs-v1",
  connectorSettings: "sift-radar-connector-settings-v1",
  evidence: "sift-radar-evidence-personal-v1",
  notes: "sift-radar-notes-personal-v1",
  important: "sift-radar-important-personal-v1",
};

function persist(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function useRadarState() {
  const [monitors, setMonitors] = useState<MonitoringQuery[]>([]);
  const [mentionsByMonitor, setMentionsByMonitor] = useState<Record<string, RadarMention[]>>({});
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [connectorSettings, setConnectorSettings] = useState<RadarConnectorSettings>(defaultRadarConnectorSettings);
  const [evidenceLinks, setEvidenceLinks] = useState<RadarEvidenceLink[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [importantIds, setImportantIds] = useState<string[]>([]);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      setMonitors(read<MonitoringQuery[]>(storageKeys.monitors, []));
      setMentionsByMonitor(read<Record<string, RadarMention[]>>(storageKeys.mentions, {}));
      setRuns(read<MonitorRun[]>(storageKeys.runs, []));
      setConnectorSettings(read<RadarConnectorSettings>(storageKeys.connectorSettings, defaultRadarConnectorSettings));
      setEvidenceLinks(read<RadarEvidenceLink[]>(storageKeys.evidence, []));
      setNotes(read<Record<string, string>>(storageKeys.notes, {}));
      setImportantIds(read<string[]>(storageKeys.important, []));
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  function addMonitor(monitor: MonitoringQuery) {
    setMonitors((current) => {
      const next = [...current, monitor];
      persist(storageKeys.monitors, next);
      return next;
    });
  }

  function removeMonitor(monitorId: string) {
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
    const cleaned = {
      rssFeedUrls: uniqueHttpUrls(settings.rssFeedUrls),
      manualUrls: uniqueHttpUrls(settings.manualUrls),
      youtubeEnabled: settings.youtubeEnabled,
    };
    setConnectorSettings(cleaned);
    persist(storageKeys.connectorSettings, cleaned);
  }

  function completeMonitorRun(monitorId: string, mentions: RadarMention[], run: MonitorRun) {
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
    setRuns((current) => {
      const next = [run, ...current].slice(0, 100);
      persist(storageKeys.runs, next);
      return next;
    });
  }

  function addEvidenceLink(link: RadarEvidenceLink) {
    setEvidenceLinks((current) => {
      const next = [...current.filter((item) => !(item.mentionId === link.mentionId && item.destination === link.destination && item.destinationId === link.destinationId)), link];
      persist(storageKeys.evidence, next);
      return next;
    });
  }

  function saveNote(mentionId: string, note: string) {
    setNotes((current) => {
      const next = { ...current, [mentionId]: note };
      persist(storageKeys.notes, next);
      return next;
    });
  }

  function toggleImportant(mentionId: string) {
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
