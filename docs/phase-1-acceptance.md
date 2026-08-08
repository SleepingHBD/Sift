# Phase 1 acceptance record

Date: 2026-08-08

## Outcome

Phase 1 passed its acceptance checkpoint. Supabase is the durable source of truth for the implemented workspace domains, while browser storage is limited to harmless preferences and reviewed legacy migration payloads until cloud verification succeeds.

## Checks completed

- A permanent GitHub-authenticated session loaded the private workspace after refresh.
- Local sign-out removed private Radar content from the current browser without revoking other browser sessions.
- Re-authentication restored the same cloud workspace.
- A second signed-in browser hydrated the same monitor and 92 genuine connector mentions.
- The reviewed browser migration completed, removed its migration banner, and preserved the source records without duplicate mentions.
- A controlled failed-write test retained the exact unsaved form input, displayed an actionable error, and allowed recovery without creating a partial project.
- Loading, empty, permission/session, offline/network, and domain write failures have distinct UI messages.
- Temporary acceptance records were removed after verification.

## Defects found and resolved

- Sign-out now uses local Supabase scope so signing out of one browser does not unexpectedly revoke the other browser used for the same personal workspace.
- Workspace errors now distinguish offline failures and session/permission failures from domain validation errors.
- The Radar metric now says `Mentions in selected period`, matching the selected date filter.
- Browser migration now skips monitor-run records already known to be cloud-persisted.
- New connector run records receive the same stable UUID for `id` and `client_ref`, making future retries idempotent.

## Final database verification

The live database was restored to its pre-acceptance baseline:

| Record | Count |
| --- | ---: |
| Internal Personal Radar projects | 1 |
| Visible user projects | 0 |
| Radar monitors | 1 |
| Mentions | 92 |
| Monitor runs | 1 |
| Topics | 4 |
| Research items | 0 |
| Inspiration items | 0 |
| Mention notes | 0 |
| Saved items | 0 |
| Important mentions | 0 |
| Duplicate mention groups | 0 |
| Temporary acceptance projects | 0 |

The retained monitor-run record has a stable `client_ref` equal to its cloud ID.

## Release note

The source changes and Edge Function update must follow the normal reviewed push and deployment workflow before they affect the published site. Acceptance work itself does not publish the website.
