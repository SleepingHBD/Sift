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
