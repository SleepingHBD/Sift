-- The Edge Function reaches this table only through a service-role RPC.
-- Keep direct browser roles explicitly denied in addition to revoked grants.
drop policy if exists "no direct client access" on private.radar_rate_limits;
create policy "no direct client access"
on private.radar_rate_limits
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
