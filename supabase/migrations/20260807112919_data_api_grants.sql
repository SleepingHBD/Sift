-- Supabase projects created after July 2026 no longer expose new tables to the
-- Data API automatically. Anonymous Auth users still receive the
-- `authenticated` database role, so only authenticated users and the trusted
-- service role need table privileges. Row-level security remains authoritative.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to authenticated, service_role;
