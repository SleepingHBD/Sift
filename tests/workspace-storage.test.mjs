import assert from "node:assert/strict";
import test from "node:test";
import {
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
}

test("the linked account claims legacy workspace data without deleting it", () => {
  const storage = new MemoryStorage();
  const legacyProjects = JSON.stringify([{ id: "project-local", name: "Existing work" }]);
  storage.setItem(workspaceStorageKeys.projects, legacyProjects);

  const result = prepareUserWorkspaceStorage(storage, "user-one");

  assert.deepEqual(result, { claimedLegacy: true, copiedKeys: 1 });
  assert.equal(storage.getItem(workspaceStorageKeys.projects), legacyProjects);
  assert.equal(storage.getItem(userWorkspaceStorageKey("user-one", workspaceStorageKeys.projects)), legacyProjects);
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
