"use client";

import { Check, Github, KeyRound, LoaderCircle, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge, Button, Card, PageIntro } from "@/components/ui/primitives";

function shortId(value: string | undefined) {
  if (!value) return "Not available";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function AccountPage() {
  const { status, user, githubLinked, githubAuthReady, pending, error, connectGitHub, signOut, clearError } = useAuth();
  const displayName = String(user?.user_metadata?.user_name || user?.user_metadata?.full_name || user?.email || "GitHub user");

  return (
    <div className="page account-page">
      <PageIntro
        eyebrow="Account"
        title="One identity. One private workspace."
        description="Use GitHub to recover your Sift workspace on another browser without changing the owner of your existing evidence."
      />

      <div className="account-layout">
        <Card className="account-primary-card">
          {status === "loading" ? (
            <div className="account-state account-state--centered">
              <LoaderCircle className="account-spinner" size={25} />
              <h2>Checking your session…</h2>
              <p>Sift is confirming which workspace identity is active on this device.</p>
            </div>
          ) : null}

          {status === "unavailable" ? (
            <div className="account-state">
              <span className="account-state__icon"><KeyRound size={22} /></span>
              <Badge>Setup needed</Badge>
              <h2>Authentication is not configured in this build.</h2>
              <p>Add the public Supabase URL and publishable key, then rebuild Sift. No private key belongs in the browser.</p>
            </div>
          ) : null}

          {status === "signed-out" ? (
            <div className="account-state">
              <span className="account-state__icon"><Github size={23} /></span>
              <Badge>{githubAuthReady ? "Permanent account" : "OAuth setup pending"}</Badge>
              <h2>Sign in to your Sift workspace.</h2>
              <p>GitHub authenticates you; Supabase keeps the workspace and its evidence protected by your Sift user ID.</p>
              <Button variant="dark" onClick={() => void connectGitHub()} disabled={pending || !githubAuthReady}>
                {pending ? <LoaderCircle className="account-spinner" size={16} /> : <Github size={16} />}
                {githubAuthReady ? "Continue with GitHub" : "GitHub setup in progress"}
              </Button>
            </div>
          ) : null}

          {status === "anonymous" ? (
            <div className="account-state">
              <span className="account-state__icon account-state__icon--warning"><UserRound size={22} /></span>
              <Badge>Temporary identity</Badge>
              <h2>Protect the workspace already on this device.</h2>
              <p>Linking GitHub upgrades this anonymous account in place. Your Sift user ID stays the same, so existing projects and Radar evidence remain attached to it.</p>
              <div className="account-id-row"><span>Current Sift ID</span><code>{shortId(user?.id)}</code></div>
              <Button variant="dark" onClick={() => void connectGitHub()} disabled={pending || !githubAuthReady}>
                {pending ? <LoaderCircle className="account-spinner" size={16} /> : <Github size={16} />}
                {githubAuthReady ? "Link this workspace to GitHub" : "GitHub setup in progress"}
              </Button>
            </div>
          ) : null}

          {status === "authenticated" ? (
            <div className="account-state">
              <span className="account-state__icon account-state__icon--success"><Check size={22} /></span>
              <Badge>{githubLinked ? "GitHub connected" : "Permanent account"}</Badge>
              <h2>{displayName}</h2>
              <p>{githubLinked ? "This workspace can now be recovered with your GitHub account." : "This is a permanent Sift account, but GitHub is not linked yet."}</p>
              <div className="account-id-row"><span>Sift user ID</span><code>{shortId(user?.id)}</code></div>
              <div className="account-actions">
                {!githubLinked ? <Button variant="dark" onClick={() => void connectGitHub()} disabled={pending || !githubAuthReady}><Github size={16} />{githubAuthReady ? "Link GitHub" : "GitHub setup in progress"}</Button> : null}
                <Button variant="secondary" onClick={() => void signOut()} disabled={pending}><LogOut size={16} />Sign out</Button>
              </div>
            </div>
          ) : null}

          {error ? <div className="account-error" role="alert"><span>{error}</span><button onClick={clearError}>Dismiss</button></div> : null}
        </Card>

        <aside className="account-assurance">
          <ShieldCheck size={22} />
          <h2>What linking changes</h2>
          <ul>
            <li><Check size={14} /><span>Your existing Sift user ID is preserved.</span></li>
            <li><Check size={14} /><span>GitHub becomes the way you recover the account.</span></li>
            <li><Check size={14} /><span>Sift never receives your GitHub password.</span></li>
          </ul>
          <p>Only link from the browser that currently contains your Sift workspace.</p>
        </aside>
      </div>
    </div>
  );
}
