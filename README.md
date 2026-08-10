# Sift

Sift is a creative strategy intelligence workspace built around one question:

> What is happening, why does it matter, and what should we make because of it?

It combines social-listening workflows, cultural research, inspiration, competitor intelligence, evidence-grounded strategy development, creative territories, and brief building. It is not a publishing or scheduling tool.

## Current application

- Blank-slate command center with guided onboarding and purposeful empty states
- Cloud-backed project creation, editing, switching, archiving, restoring, and deletion
- Radar monitor creation with a simple guided query form and an advanced Boolean editor
- Functional Radar collection through RSS/Atom feeds, manually supplied public URLs, and the official YouTube Data API
- Cloud-backed Radar monitors, source-level collection health and run diagnostics, database-calculated coverage, headline metrics, timelines, sentiment, topics, keywords, and evidence-linked spikes, plus normalized conversations, notes, saved and important markers, evidence relationships, cloud-backed schedules, and explicit audited retention controls
- Cloud-backed Research and Inspiration libraries with project assignment, search, filtering, source links, relationship-aware protected deletion, CSV evidence import, and reviewed browser-data migration
- Persistent evidence capture for project-scoped links, notes, social posts, screenshots, images, and PDFs, including secure URL metadata inspection, canonical duplicate warnings, private file previews, and manual-save fallback
- Unified project evidence inbox across Radar mentions, Research, social captures, files, CSV imports, and Inspiration, with PostgreSQL full-text retrieval, stable cursor pagination, durable private saved views, filters, sorting, grouping, matched-term highlighting, review progress, durable single and bulk review states, shared tags, project-scoped strategist topics, editable notes, non-destructive project links, and a provenance-first detail drawer that shows downstream relationships
- Evidence-scoped Signals workspace for recording working observations and hypotheses, linking original project sources as support/contradiction/context, preserving source rationales and visible scope qualifiers, creating transparent append-only assessments, correcting claims and topics with revision history, merging or splitting with provenance, and deliberately promoting only database-verified evidence into observed Trends
- Empty-state workspaces for brands, competitors, briefs, and Strategy AI
- GitHub authentication with a protected permanent-account workspace
- Global search, responsive navigation, light and dark modes
- Static GitHub Pages export
- Supabase schema with project ownership, Row Level Security, full-text indexes, normalized mentions, monitor runs, evidence links, and strategy entities

The application ships with no sample brands, projects, conversations, analytics, or strategic conclusions. New records appear only when the user creates them. Radar analytics remain empty until a genuine connector retrieves source records.

## Run locally

Requirements: Node.js 22+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The production build is written to `out/`.

## Current persistence

Projects, Research, Inspiration, Radar monitors, connector-created conversations, run history, notes, saved and important markers, evidence relationships, and Signals are now cloud-first. After GitHub sign-in, the application hydrates these records from Supabase under project Row Level Security. Creates and deletes write through the authenticated Data API; connector collection remains behind the JWT-protected Edge Function. New records derive their owner or creator from the verified JWT rather than accepting an identity from the browser.

Research and Inspiration deletion first inspects tags, project links, saved markers, attachments, and strategic citations. Insight and brief citations protect a source from deletion until the citation is deliberately removed; non-strategic organization links are disclosed and removed atomically with the source. The original external webpage or social post is never affected.

Screenshot, image, and PDF evidence is stored in the private `evidence-assets` Storage bucket. Uploads are limited to JPG, PNG, WebP, and PDF files of 20 MB or less. Storage paths are uploader- and project-scoped, access is checked through Row Level Security, and the Research library opens files with short-lived signed links rather than public URLs.

CSV evidence import accepts a local file of up to 500 data rows or 5 MB, automatically suggests field mappings, previews validation and duplicates, and lets the strategist skip or deliberately retain matches. The raw CSV remains in the browser. Supabase receives only the mapped rows, imports accepted records into `research_items`, links shared tags, and stores a minimal RLS-protected run/row audit. A stable request UUID makes network retries idempotent.

Social-post capture stores a strategist-selected link, platform, optional account, source text, selected comments, observed date, screenshot, and why-it-matters annotation in the same private Research workflow. These records are explicitly marked `strategist captured`; they are never presented as connector-collected conversations.

If older project, research, inspiration, or Radar records are found in browser storage, the relevant page offers a downloadable JSON backup plus an idempotent cloud import. Research and Inspiration imports require an explicit destination project because legacy browser items did not store that relationship. Local payloads are removed only after Supabase confirms the cloud write and reload. Theme, connector configuration, and the active-project selection remain local preferences for now.

Radar annotations use authenticated, per-user repositories. Older device-scoped notes, saved markers, important marks, and evidence links are offered as a reviewed, retry-safe import and are cleared only after cloud verification. Monitor definitions, run audits, sources, normalized mentions, sentiment, keywords, topics, and mention-topic links hydrate from Supabase. Coverage, headline metrics, detailed analytics, and the cursor-paginated conversation feed query the complete authorized monitor history through RLS-invoker database functions. The initial workspace hydration remains capped at the newest 5,000 records for responsive client fallbacks, while topic and spike evidence can retrieve supporting records directly by verified database identity. GitHub OAuth is the only supported sign-in method; anonymous access, email/password access, manual identity linking, and new registrations are disabled in the personal production workspace. If connector cloud persistence fails after collection, Radar labels the retrieved response as temporary and does not claim it was durably saved.

## Supabase setup

1. Create a Supabase project. Keep **Anonymous Sign-Ins** and **Manual Linking** disabled. For a personal workspace, enable only the selected OAuth provider and disable other sign-in methods.
2. Link the repository and apply the migrations:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. Deploy the secure connector function:

   ```bash
   supabase functions deploy radar-connectors --use-api
   ```

4. For YouTube collection, enable YouTube Data API v3 in Google Cloud and store the key only as a Function secret:

   ```bash
   supabase secrets set YOUTUBE_API_KEY=YOUR_KEY
   ```

5. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key. Keep Row Level Security enabled. Never expose the service-role key or YouTube key through a `NEXT_PUBLIC_` variable.

6. Configure a GitHub OAuth App with the Supabase callback URL, enable the GitHub provider in Supabase, and allow both the production and local `/account/` return URLs. Set `NEXT_PUBLIC_GITHUB_AUTH_ENABLED=true` only after the provider is genuinely active. After the intended GitHub user has signed in once, disable **Allow new users to sign up** for a single-user deployment.

7. For GitHub Pages, create repository variables named `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_GITHUB_AUTH_ENABLED`. The deployment workflow passes them into the static build. Until GitHub OAuth is ready, use `NEXT_PUBLIC_GITHUB_AUTH_ENABLED=false` so the interface accurately labels the unavailable action.

## Radar and connector policy

Connector contracts live in `lib/connectors`, while the deployable runtime is in `supabase/functions/radar-connectors`. Platform payloads normalize to the shared mention shape before processing. Connector states are `live`, `not-connected`, or `coming-later`.

The implemented sources are RSS/Atom feeds, manually supplied public URLs, and YouTube video search with public top-level comments through the official API. Manual imports reject local/private network targets, non-web protocols, nonstandard ports, oversized responses, and excessive redirects. Reddit and other social platforms remain unavailable until official access is configured. Sift must not scrape sources in violation of their terms.

The static client never receives connector credentials. Monitor runs and URL metadata inspection execute in the authenticated Supabase Edge Function and the database remains protected by project-scoped Row Level Security. URL inspection applies project access checks, a separate extraction quota, private-network and redirect protections, response limits, and an explicit raw-link fallback when a page cannot be read.

Connector runs execute eligible sources independently, apply an 18-second source budget and one bounded retry for transient timeouts, rate limits, network failures, and server errors, and preserve successful results when another source fails. Run history records retrieved, created, refreshed, and deduplicated counts; source duration, attempts, timeout state, last success, quota remaining, and cloud-persistence status are visible in Radar's collapsed **Collection health** panel.

Each monitor can store a manual, daily, or weekly schedule and a keep-forever, 90-day, 180-day, or 365-day raw-conversation retention preference. Source settings sync to each monitor project through `connector_configs`, while connector credentials remain server-only. Scheduled and manual collection share the same quota, lease, retry, checkpoint, normalization, and persistence path. The scheduler uses `pg_cron`, asynchronous `pg_net`, a JWT-protected Edge Function, a separate high-entropy Vault credential, atomic short-lived claims, and bounded retries. It reports itself unavailable until its Vault secrets and cron job have been explicitly activated.

Retention is **off by default** and requires a separate per-monitor checkbox after a daily or weekly schedule and retention window are configured. The authenticated RLS-invoker preview counts aged conversations before opt-in. After a successful scheduled collection, an opted-in monitor can remove at most 250 eligible raw conversations. Saved, cited, noted, tagged, important, trend-linked, and reviewed conversations are always protected. Every batch writes a content-free record to `radar_retention_runs`; failures are audited without changing the successful collection result. Pausing the monitor, switching to manual collection, or choosing **Forever** automatically disables retention.

### Radar scheduler activation

Deploy `radar-connectors` and `radar-scheduler` with JWT verification enabled, apply the scheduler migration, then create these three named Vault secrets without committing their values:

- `sift_project_url`: the Supabase project URL.
- `sift_publishable_key`: the active legacy `anon` JWT used only to pass the Edge Function gateway. It is not a service-role key.
- `sift_radar_scheduler_token`: at least 32 random characters, generated and stored only in Vault.

After the function and secrets are ready, activate the minute-level dispatcher from the Supabase SQL editor with `select private.install_radar_scheduler();`. This is an explicit production operation because it enables unattended connector requests. The job can be deactivated with `select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'sift-radar-scheduler'), active := false);`. Never store the service-role key in the browser, repository, cron command, or `connector_configs`.

Production status: the scheduler was explicitly activated and verified on 9 August 2026. Its automatic dispatch returns successfully with no work when no eligible monitor is due. The user-configured `RDC` monitor also completed its first automatic scheduled YouTube run, persisted 21 genuine records with no duplicates, advanced its incremental checkpoint, and calculated the next occurrence. A monitor still runs automatically only after its own daily or weekly schedule is enabled. Retention enforcement is deployed but remains inactive unless that monitor's separate retention checkbox is enabled.

## Strategy AI on GitHub Pages

Phase 6 uses a manual ChatGPT handoff and does not require an OpenAI API key or separate model billing. The JWT-protected Supabase `strategy-ai` Edge Function authenticates the user, verifies project access through RLS, retrieves normalized full-text evidence with stable source IDs, and lets the strategist inspect and narrow that scope. Sift then prepares a visible citation-ready prompt. Nothing is sent automatically: the strategist copies the prompt into their existing ChatGPT account and pastes the JSON response back into Sift.

Before storage, the backend revalidates the exact selected sources under the caller's RLS context, rejects malformed output and missing or inaccessible citations, fixes the provenance as a manual ChatGPT handoff, and persists the conversation atomically through the existing service-only database function. Direct browser writes to AI conversations and messages remain revoked. A five-scenario evaluation suite covers evidence sufficiency, fact-versus-interpretation discipline, contradictions, hostile source text, and evidence-to-recommendation reasoning. See [docs/strategy-ai.md](docs/strategy-ai.md) and [docs/strategy-ai-evaluation.md](docs/strategy-ai-evaluation.md).

## GitHub Pages deployment

Deployment is manual. Pushing to `main` does not publish the website:

1. Open **Settings → Pages** in the GitHub repository.
2. Set **Source** to **GitHub Actions**.
3. Open **Actions â†’ Deploy Sift to GitHub Pages** and choose **Run workflow** only when you intend to publish.

The build applies the repository subpath to routes and assets automatically.

The static export includes a restrictive browser content policy and referrer policy. GitHub Pages controls HTTP response headers, so stronger server headers such as `X-Content-Type-Options` and an HTTP-delivered frame policy require moving the frontend to a host with configurable headers.

See [docs/architecture.md](docs/architecture.md), [docs/radar.md](docs/radar.md), [docs/signals.md](docs/signals.md), [docs/strategy-ai.md](docs/strategy-ai.md), [docs/strategy-ai-evaluation.md](docs/strategy-ai-evaluation.md), [docs/development-roadmap.md](docs/development-roadmap.md), [docs/phase-0-audit.md](docs/phase-0-audit.md), [docs/phase-1-acceptance.md](docs/phase-1-acceptance.md), [docs/phase-3-acceptance.md](docs/phase-3-acceptance.md), [docs/phase-4-acceptance.md](docs/phase-4-acceptance.md), and [docs/phase-5-acceptance.md](docs/phase-5-acceptance.md) for implementation boundaries, the evidence-first development sequence, backend findings, and acceptance evidence.
