-- Keep saved views aligned with Sift's permanent GitHub-account boundary.
-- Supabase anonymous identities also use the authenticated database role, so
-- this restrictive policy remains necessary even while anonymous sign-in is off.

create policy "permanent authenticated users only"
on public.evidence_saved_views
as restrictive
for all
to authenticated
using (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
)
with check (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
);
