"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type SiftAuthStatus = "loading" | "unavailable" | "signed-out" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: SiftAuthStatus;
  session: Session | null;
  user: User | null;
  githubLinked: boolean;
  githubAuthReady: boolean;
  pending: boolean;
  error: string;
  connectGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function statusForSession(session: Session | null): SiftAuthStatus {
  if (!session) return "signed-out";
  return session.user.is_anonymous ? "anonymous" : "authenticated";
}

function accountReturnUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (localHost) return `${window.location.origin}/account/`;
  if (configuredSiteUrl) return `${configuredSiteUrl}/account/`;
  const accountIndex = window.location.pathname.indexOf("/account");
  const basePath = accountIndex >= 0 ? window.location.pathname.slice(0, accountIndex) : "";
  return `${window.location.origin}${basePath}/account/`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const githubAuthReady = process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true";
  const [status, setStatus] = useState<SiftAuthStatus>(authConfigured ? "loading" : "unavailable");
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const syncSession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setStatus(statusForSession(nextSession));
  }, []);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    if (!client) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;
    const verificationTimeout = window.setTimeout(() => {
      if (!active) return;
      setError("Session verification took too long. Reload this page or sign in again from Account.");
      syncSession(null);
    }, 8_000);

    void client.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        syncSession(null);
      } else if (!data.session) {
        setError("");
        syncSession(null);
      } else {
        const { data: verified, error: userError } = await client.auth.getUser();
        if (!active) return;
        if (userError || !verified.user || verified.user.id !== data.session.user.id) {
          setError(userError?.message || "Your session could not be verified. Please sign in again.");
          syncSession(null);
        } else {
          setError("");
          syncSession({ ...data.session, user: verified.user });
        }
      }

      if (!active) return;
      window.clearTimeout(verificationTimeout);
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
        if (active) syncSession(nextSession);
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch((sessionError: unknown) => {
      if (!active) return;
      window.clearTimeout(verificationTimeout);
      setError(sessionError instanceof Error ? sessionError.message : "Your session could not be verified.");
      syncSession(null);
    });

    return () => {
      active = false;
      window.clearTimeout(verificationTimeout);
      unsubscribe?.();
    };
  }, [syncSession]);

  const githubLinked = useMemo(
    () => Boolean(session?.user.identities?.some((identity) => identity.provider === "github")),
    [session],
  );

  async function connectGitHub() {
    if (!githubAuthReady) {
      setError("GitHub sign-in is still being configured for this build.");
      return;
    }
    const client = createBrowserSupabaseClient();
    if (!client) {
      setError("Supabase is not configured for this build.");
      return;
    }

    if (session) {
      if (githubLinked) return;
      setError("Sign out before continuing with the GitHub account that owns this workspace.");
      return;
    }

    setPending(true);
    setError("");
    const options = { redirectTo: accountReturnUrl() };
    const result = await client.auth.signInWithOAuth({ provider: "github", options });

    if (result.error) {
      setError(result.error.message);
      setPending(false);
    }
  }

  async function signOut() {
    const client = createBrowserSupabaseClient();
    if (!client) return;
    setPending(true);
    setError("");
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) setError(signOutError.message);
    setPending(false);
  }

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    githubLinked,
    githubAuthReady,
    pending,
    error,
    connectGitHub,
    signOut,
    clearError: () => setError(""),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
