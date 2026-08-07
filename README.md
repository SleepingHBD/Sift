# Sift

Sift is a creative strategy intelligence workspace built around one question:

> What is happening, why does it matter, and what should we make because of it?

It combines social-listening workflows, cultural research, inspiration, competitor intelligence, evidence-grounded strategy development, creative territories, and brief building. It is not a publishing or scheduling tool.

## Current application

- Blank-slate command center with guided onboarding and purposeful empty states
- Project creation and local project switching
- Radar monitor creation with a simple guided query form and an advanced Boolean editor
- Functional Radar collection through RSS/Atom feeds, manually supplied public URLs, and the official YouTube Data API
- Radar views for metrics, timelines, topics, spikes, mentions, source detail, and evidence
- Research and inspiration libraries with browser-local creation and search
- Empty-state workspaces for brands, competitors, trends, briefs, and Strategy AI
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

The GitHub Pages build currently stores client-created projects, monitors, collected Radar records, research, inspiration, notes, saves, and evidence links in user-scoped browser storage on the current device. Private routes hydrate those caches only for a verified permanent Sift user. This lets a completed connector run remain usable immediately and offline on that device without exposing one account's cached workspace to another account on the same browser.

Connector runs also write projects, monitor definitions, run audits, sources, normalized mentions, sentiment, keywords, topics, and mention-topic links to Supabase. The account interface supports GitHub OAuth and can upgrade an existing anonymous session through identity linking so its Sift user ID is preserved. If cloud persistence fails after collection, Radar labels the condition and keeps the retrieved records in the signed-in user's device cache.

## Supabase setup

1. Create a Supabase project. Enable **Manual Linking** only while an existing anonymous workspace is being upgraded to GitHub. Keep **Anonymous Sign-Ins** disabled for the permanent-account workspace; if a temporary migration window is required, enable CAPTCHA or Turnstile as recommended by Supabase and disable anonymous sign-ins again immediately after verification.
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

6. Configure a GitHub OAuth App with the Supabase callback URL, enable the GitHub provider in Supabase, and allow both the production and local `/account/` return URLs. Set `NEXT_PUBLIC_GITHUB_AUTH_ENABLED=true` only after the provider is genuinely active.

7. For GitHub Pages, create repository variables named `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_GITHUB_AUTH_ENABLED`. The deployment workflow passes them into the static build. Until GitHub OAuth is ready, use `NEXT_PUBLIC_GITHUB_AUTH_ENABLED=false` so the interface accurately labels the unavailable action.

## Radar and connector policy

Connector contracts live in `lib/connectors`, while the deployable runtime is in `supabase/functions/radar-connectors`. Platform payloads normalize to the shared mention shape before processing. Connector states are `live`, `not-connected`, or `coming-later`.

The implemented sources are RSS/Atom feeds, manually supplied public URLs, and YouTube video search with public top-level comments through the official API. Manual imports reject local/private network targets, non-web protocols, nonstandard ports, oversized responses, and excessive redirects. Reddit and other social platforms remain unavailable until official access is configured. Sift must not scrape sources in violation of their terms.

The static client never receives connector credentials. Monitor runs execute in the authenticated Supabase Edge Function and the database remains protected by project-scoped Row Level Security.

## Strategy AI on GitHub Pages

GitHub Pages cannot protect an OpenAI API key. A secure endpoint should authenticate the user, retrieve only authorized project evidence, call OpenAI server-side, and return structured claims with source IDs and confidence. Workspace-backed claims must cite stored evidence; general brainstorming must be labeled separately.

## GitHub Pages deployment

The workflow deploys pushes to `main`:

1. Open **Settings → Pages** in the GitHub repository.
2. Set **Source** to **GitHub Actions**.
3. Push the repository to `main`.

The build applies the repository subpath to routes and assets automatically.

See [docs/architecture.md](docs/architecture.md), [docs/radar.md](docs/radar.md), [docs/development-roadmap.md](docs/development-roadmap.md), and [docs/phase-0-audit.md](docs/phase-0-audit.md) for implementation boundaries, the evidence-first development sequence, and current backend findings.
