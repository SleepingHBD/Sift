export const workspaceStorageKeys = {
  projects: "sift-user-projects-v1",
  activeProject: "sift-active-project-personal",
  inspiration: "sift-user-inspiration-v1",
  research: "sift-user-research-v1",
  savedItems: "sift-saved-items-personal",
  radarMonitors: "sift-radar-monitors-v2",
  radarMentions: "sift-radar-mentions-v1",
  radarRuns: "sift-radar-runs-v1",
  radarConnectorSettings: "sift-radar-connector-settings-v1",
  radarEvidence: "sift-radar-evidence-personal-v1",
  radarNotes: "sift-radar-notes-personal-v1",
  radarImportant: "sift-radar-important-personal-v1",
} as const;

const legacyOwnerKey = "sift-local-workspace-owner-v1";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

export function userWorkspaceStorageKey(userId: string, legacyKey: string) {
  return `${legacyKey}:user:${userId}`;
}

/**
 * Claims the old unscoped browser cache for the first permanent Sift account
 * used on this browser. Legacy values are copied, never deleted, so Phase 1
 * can still offer a reviewed cloud migration and downloadable backup.
 */
export function prepareUserWorkspaceStorage(storage: StorageLike, userId: string) {
  if (!userId) return { claimedLegacy: false, copiedKeys: 0 };

  const legacyOwner = storage.getItem(legacyOwnerKey);
  if (legacyOwner && legacyOwner !== userId) {
    return { claimedLegacy: false, copiedKeys: 0 };
  }

  let copiedKeys = 0;
  for (const legacyKey of Object.values(workspaceStorageKeys)) {
    const scopedKey = userWorkspaceStorageKey(userId, legacyKey);
    if (storage.getItem(scopedKey) !== null) continue;
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue === null) continue;
    storage.setItem(scopedKey, legacyValue);
    copiedKeys += 1;
  }

  if (!legacyOwner) storage.setItem(legacyOwnerKey, userId);
  return { claimedLegacy: !legacyOwner, copiedKeys };
}

/**
 * Removes only project payloads after every local project has been confirmed in
 * Supabase. Other Phase 1 migration candidates remain untouched.
 */
export function clearMigratedProjectStorage(storage: StorageLike, userId: string) {
  if (!userId || !storage.removeItem) return;
  storage.removeItem(userWorkspaceStorageKey(userId, workspaceStorageKeys.projects));
  if (storage.getItem(legacyOwnerKey) === userId) {
    storage.removeItem(workspaceStorageKeys.projects);
  }
}

export function clearMigratedLibraryStorage(
  storage: StorageLike,
  userId: string,
  library: "research" | "inspiration",
) {
  if (!userId || !storage.removeItem) return;
  const storageKey = workspaceStorageKeys[library];
  storage.removeItem(userWorkspaceStorageKey(userId, storageKey));
  if (storage.getItem(legacyOwnerKey) === userId) {
    storage.removeItem(storageKey);
  }
}

/** Clears only the three Radar payloads that now live in Supabase. Connector
 * connector settings and evidence annotations are intentionally excluded;
 * each has its own migration lifecycle. */
export function clearMigratedRadarStorage(storage: StorageLike, userId: string) {
  if (!userId || !storage.removeItem) return;
  const keys = [workspaceStorageKeys.radarMonitors, workspaceStorageKeys.radarMentions, workspaceStorageKeys.radarRuns];
  for (const storageKey of keys) {
    storage.removeItem(userWorkspaceStorageKey(userId, storageKey));
    if (storage.getItem(legacyOwnerKey) === userId) storage.removeItem(storageKey);
  }
}

/** Clears only Radar annotations that have been confirmed in Supabase. Saved
 * IDs belonging to other product areas remain in the browser cache. */
export function clearMigratedRadarAnnotationStorage(
  storage: StorageLike,
  userId: string,
  migratedMentionIds: string[],
) {
  if (!userId || !storage.removeItem) return;
  const annotationKeys = [
    workspaceStorageKeys.radarEvidence,
    workspaceStorageKeys.radarNotes,
    workspaceStorageKeys.radarImportant,
  ];
  for (const storageKey of annotationKeys) {
    storage.removeItem(userWorkspaceStorageKey(userId, storageKey));
    if (storage.getItem(legacyOwnerKey) === userId) storage.removeItem(storageKey);
  }

  const migrated = new Set(migratedMentionIds);
  const savedKey = workspaceStorageKeys.savedItems;
  const keys = [userWorkspaceStorageKey(userId, savedKey)];
  if (storage.getItem(legacyOwnerKey) === userId) keys.push(savedKey);
  for (const key of keys) {
    let current: string[] = [];
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "[]");
      if (Array.isArray(parsed)) current = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      continue;
    }
    const remaining = current.filter((id) => !migrated.has(id));
    if (remaining.length) storage.setItem(key, JSON.stringify(remaining));
    else storage.removeItem(key);
  }
}
