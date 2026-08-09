-- Supabase's security advisor flags extensions registered in public. This
-- migration runs before scheduler activation, while pg_net has no queued
-- requests or response history, and recreates it in the standard extensions
-- schema. pg_net continues to expose its HTTP routines through the `net`
-- schema.

drop extension pg_net;
create extension pg_net with schema extensions;
