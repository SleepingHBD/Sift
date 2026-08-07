import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("production publishing remains an explicit manual action", async () => {
  const workflow = await read(".github/workflows/deploy-pages.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
});

test("Radar requires verified JWTs and server-side quotas", async () => {
  const [config, handler] = await Promise.all([
    read("supabase/config.toml"),
    read("supabase/functions/radar-connectors/index.ts"),
  ]);

  assert.match(config, /verify_jwt\s*=\s*true/);
  assert.match(handler, /consume_radar_quota/);
  assert.match(handler, /65_536/);
});

test("the client cannot perform manual identity linking", async () => {
  const provider = await read("components/auth/auth-provider.tsx");

  assert.doesNotMatch(provider, /linkIdentity/);
  assert.match(provider, /signInWithOAuth/);
});

test("the static export declares a constrained browser content policy", async () => {
  const layout = await read("app/layout.tsx");

  assert.match(layout, /Content-Security-Policy/);
  assert.match(layout, /object-src 'none'/);
  assert.match(layout, /connect-src 'self' https:\/\/\*\.supabase\.co/);
});
