import assert from "node:assert/strict";
import test from "node:test";
import {
  clearMigratedLibraryStorage,
  clearMigratedProjectStorage,
  clearMigratedRadarAnnotationStorage,
  clearMigratedRadarStorage,
  prepareUserWorkspaceStorage,
  userWorkspaceStorageKey,
  workspaceStorageKeys,
} from "../lib/workspace-storage.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("the permanent account claims legacy workspace data without deleting it", () => {
  const storage = new MemoryStorage();
  const legacyProjects = JSON.stringify([{ id: "project-local", name: "Existing work" }]);
  storage.setItem(workspaceStorageKeys.projects, legacyProjects);

  const result = prepareUserWorkspaceStorage(storage, "user-one");

  assert.deepEqual(result, { claimedLegacy: true, copiedKeys: 1 });
  assert.equal(storage.getItem(workspaceStorageKeys.projects), legacyProjects);
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.projects)), legacyProjects);
});

test("confirmed library migration clears only the selected library", () => {
  const storage = new MemoryStorage();
  const research = JSON.stringify([{ id: "research-local" }]);
  const inspiration = JSON.stringify([{ id: "inspiration-local" }]);
  storage.setItem(workspaceStorageKeys.research, research);
  storage.setItem(workspaceStorageKeys.inspiration, inspiration);
  prepareUserWorkspaceStorage(storage, "user-one");

  clearMigratedLibraryStorage(storage, "user-one", "research");

  assert.equal(storage.getItem(workspaceStorageKeys.research), null);
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.research)), null);
  assert.equal(storage.getItem(workspaceStorageKeys.inspiration), inspiration);
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.inspiration)), inspiration);
});

test("a different account cannot inherit another account's legacy browser cache", () => {
  const storage = new MemoryStorage();
  storage.setItem(workspaceStorageKeys.research, JSON.stringify([{ id: "private-research" }]));
  prepareUserWorkspaceStorage(storage, "user-one");

  const result = prepareUserWorkspaceStorage(storage, "user-two");

  assert.deepEqual(result, { claimedLegacy: false, copiedKeys: 0 });
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-two", workspaceStorageKeys.research)), null);
});

test("legacy migration is idempotent and never overwrites scoped account data", () => {
  const storage = new MemoryStorage();
  const scopedKey = userWorkspaceStorageKey("user-one", workspaceStorageKeys.radarMonitors);
  storage.setItem(workspaceStorageKeys.radarMonitors, JSON.stringify([{ id: "legacy-monitor" }]));
  storage.setItem(scopedKey, JSON.stringify([{ id: "new-monitor" }]));

  prepareUserWorkspaceStorage(storage, "user-one");
  const secondRun = prepareUserWorkspaceStorage(storage, "user-one");

  assert.equal(storage.getItem(scopedKey), JSON.stringify([{ id: "new-monitor" }]));
  assert.deepEqual(secondRun, { claimedLegacy: false, copiedKeys: 0 });
});

test("confirmed project migration clears only project payloads", () => {
  const storage = new MemoryStorage();
  const projects = JSON.stringify([{ id: "project-local" }]);
  const research = JSON.stringify([{ id: "research-local" }]);
  storage.setItem(workspaceStorageKeys.projects, projects);
  storage.setItem(workspaceStorageKeys.research, research);
  prepareUserWorkspaceStorage(storage, "user-one");

  clearMigratedProjectStorage(storage, "user-one");

  assert.equal(storage.getItem(workspaceStorageKeys.projects), null);
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.projects)), null);
  assert.equal(storage.getItem(workspaceStorageKeys.research), research);
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.research)), research);
});

test("confirmed Radar migration clears cloud-owned Radar payloads but keeps unfinished annotations", () => {
  const storage = new MemoryStorage();
  storage.setItem(workspaceStorageKeys.radarMonitors, JSON.stringify([{ id: "monitor-local" }]));
  storage.setItem(workspaceStorageKeys.radarMentions, JSON.stringify({ "monitor-local": [{ id: "mention-local" }] }));
  storage.setItem(workspaceStorageKeys.radarRuns, JSON.stringify([{ id: "run-local" }]));
  storage.setItem(workspaceStorageKeys.radarNotes, JSON.stringify({ "mention-local": "Keep this note" }));
  prepareUserWorkspaceStorage(storage, "user-one");

  clearMigratedRadarStorage(storage, "user-one");

  for (const key of [workspaceStorageKeys.radarMonitors, workspaceStorageKeys.radarMentions, workspaceStorageKeys.radarRuns]) {
    assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", key)), null);
  }
  assert.notEqual(storage.getItem(workspaceStorageKeys.radarNotes), null);
  assert.notEqual(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.radarNotes)), null);
});

test("confirmed Radar annotation migration preserves saved markers from other libraries", () => {
  const storage = new MemoryStorage();
  storage.setItem(workspaceStorageKeys.radarNotes, JSON.stringify({ "mention-local": "Keep this note" }));
  storage.setItem(workspaceStorageKeys.radarEvidence, JSON.stringify([{ mentionId: "mention-local" }]));
  storage.setItem(workspaceStorageKeys.radarImportant, JSON.stringify(["mention-local"]));
  storage.setItem(workspaceStorageKeys.savedItems, JSON.stringify(["mention-local", "inspiration-local"]));
  prepareUserWorkspaceStorage(storage, "user-one");

  clearMigratedRadarAnnotationStorage(storage, "user-one", ["mention-local"]);

  for (const key of [workspaceStorageKeys.radarNotes, workspaceStorageKeys.radarEvidence, workspaceStorageKeys.radarImportant]) {
    assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", key)), null);
  }
  assert.deepEqual(JSON.parse(storage.getItem(workspaceStorageKeys.savedItems)), ["inspiration-local"]);
  assert.deepEqual(JSON.parse(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.savedItems))), ["inspiration-local"]);
});
