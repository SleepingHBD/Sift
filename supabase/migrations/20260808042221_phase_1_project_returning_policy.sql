-- Project INSERT ... RETURNING must be able to read the row created in the
-- current statement. The existing stable membership helper cannot observe a
-- row created by that same statement, so check direct ownership first and use
-- the helper only for non-owner project members.

alter policy "members read projects"
  on public.projects
  to authenticated
  using (
    owner_id = (select auth.uid())
    or public.can_access_project(id)
  );
