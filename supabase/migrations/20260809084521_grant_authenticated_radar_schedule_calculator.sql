-- The schedule-preparation trigger runs as the signed-in user and calls this
-- pure helper to calculate the monitor's next wall-clock occurrence.
-- Keep anonymous/public access denied while allowing authenticated saves and
-- trusted service-role scheduling.
revoke all on function private.next_radar_schedule_after(
  text,
  smallint,
  smallint,
  text,
  timestamptz
) from public, anon;

grant execute on function private.next_radar_schedule_after(
  text,
  smallint,
  smallint,
  text,
  timestamptz
) to authenticated, service_role;
