"use client";

import Link from "next/link";
import { Github, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

export function WorkspaceAccessGate() {
  const { status, githubAuthReady, error } = useAuth();

  const content = status === "loading"
    ? {
        icon: <LoaderCircle className="account-spinner" size={24} />,
        eyebrow: "Checking access",
        title: "Opening your private workspace…",
        description: "Sift is verifying the account attached to this browser.",
      }
    : status === "anonymous"
      ? {
          icon: <ShieldCheck size={24} />,
          eyebrow: "Old session detected",
          title: "This temporary session is no longer accepted.",
          description: "Open Account, sign out of the retired session, then use the GitHub account that owns your Sift workspace.",
        }
      : status === "unavailable"
        ? {
            icon: <KeyRound size={24} />,
            eyebrow: "Authentication unavailable",
            title: "This build cannot open private workspace data.",
            description: "The public Supabase configuration is missing. Add it to the build environment before using Sift.",
          }
        : {
            icon: <Github size={24} />,
            eyebrow: "Private workspace",
            title: "Sign in to continue.",
            description: "Use the GitHub account linked to Sift to recover your projects, evidence, and Radar workspace.",
          };

  const canOpenAccount = status === "anonymous" || (status === "signed-out" && githubAuthReady);

  return (
    <main className="workspace-access-gate">
      <section className="workspace-access-card" aria-live="polite">
        <div className="workspace-access-mark" aria-hidden="true">S</div>
        <span className="workspace-access-icon">{content.icon}</span>
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        {canOpenAccount ? (
          <Link className="ui-button ui-button--dark ui-button--md workspace-access-action" href="/account">
            <Github size={16} />
            {status === "anonymous" ? "Resolve account access" : "Continue with GitHub"}
          </Link>
        ) : null}
        {error ? <small role="alert">{error}</small> : status === "signed-out" && !githubAuthReady ? <small>GitHub sign-in is not enabled in this build.</small> : null}
      </section>
    </main>
  );
}
