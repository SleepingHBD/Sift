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
        description="GitHub is the only sign-in and recovery method for your private Sift workspace."
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
              <Badge>Retired session</Badge>
              <h2>Temporary access is no longer accepted.</h2>
              <p>Your workspace has already been transferred to its permanent GitHub account. Sign out of this old session, then continue with GitHub.</p>
              <div className="account-id-row"><span>Retired Sift ID</span><code>{shortId(user?.id)}</code></div>
              <Button variant="dark" onClick={() => void signOut()} disabled={pending}>
                {pending ? <LoaderCircle className="account-spinner" size={16} /> : <LogOut size={16} />}
                Sign out old session
              </Button>
            </div>
          ) : null}

          {status === "authenticated" ? (
            <div className="account-state">
              <span className="account-state__icon account-state__icon--success"><Check size={22} /></span>
              <Badge>{githubLinked ? "GitHub connected" : "Permanent account"}</Badge>
              <h2>{displayName}</h2>
              <p>{githubLinked ? "This workspace is owned by and recoverable through your GitHub account." : "This account does not use Sift's supported GitHub sign-in method. Sign out and continue with the workspace owner account."}</p>
              <div className="account-id-row"><span>Sift user ID</span><code>{shortId(user?.id)}</code></div>
              <div className="account-actions">
                <Button variant="secondary" onClick={() => void signOut()} disabled={pending}><LogOut size={16} />Sign out</Button>
              </div>
            </div>
          ) : null}

          {error ? <div className="account-error" role="alert"><span>{error}</span><button onClick={clearError}>Dismiss</button></div> : null}
        </Card>

        <aside className="account-assurance">
          <ShieldCheck size={22} />
          <h2>How your workspace is protected</h2>
          <ul>
            <li><Check size={14} /><span>Your GitHub identity owns the cloud workspace.</span></li>
            <li><Check size={14} /><span>Anonymous and email sign-ins are disabled.</span></li>
            <li><Check size={14} /><span>Database rules isolate data by the verified owner ID.</span></li>
            <li><Check size={14} /><span>Sift never receives your GitHub password.</span></li>
          </ul>
          <p>Only continue with the GitHub account configured for this Sift workspace.</p>
        </aside>
      </div>
    </div>
  );
}
