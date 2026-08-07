import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null | undefined;

export function createBrowserSupabaseClient() {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    browserClient = null;
    return browserClient;
  }
  browserClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return browserClient;
}
