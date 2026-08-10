"use client";

import Link from "next/link";
import { CircleDashed, Database, KeyRound, MessageSquareText, Plug, Radio, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, PageIntro, SectionHeader } from "@/components/ui/primitives";
import { isRadarConnectorBackendConfigured } from "@/lib/radar/connector-service";

const connectors = [
  { name: "Reddit", status: "Not connected", mode: "Credentials required", type: "Official API", future: false },
  { name: "YouTube", status: "Implemented", mode: "Server API key required", type: "YouTube Data API", future: false },
  { name: "RSS & Atom", status: "Implemented", mode: "Add feed URLs in Radar", type: "Open feed", future: false },
  { name: "Manual URL", status: "Implemented", mode: "Add public URLs in Radar", type: "User-supplied source", future: false },
  { name: "Instagram", status: "Coming later", mode: "No collection", type: "Official API required", future: true },
  { name: "TikTok", status: "Coming later", mode: "No collection", type: "Official API required", future: true },
];

export function SettingsPage() {
  const backendConfigured = isRadarConnectorBackendConfigured();
  return (
    <div className="page">
      <PageIntro eyebrow="Settings" title="Connect carefully. Stay honest." description="Configure the workspace, data sources, and secure services. A source is usable only after a genuine connection is established." />
      <div className="settings-layout">
        <nav className="settings-nav">
          <button className="active"><Plug size={16} />Data connectors</button>
          <button disabled title="This settings section is not available yet"><Database size={16} />Database</button>
          <Link href="/account"><KeyRound size={16} />Authentication</Link>
          <button disabled title="This settings section is not available yet"><ShieldCheck size={16} />AI & privacy</button>
        </nav>
        <div className="settings-content">
          <Card className="settings-status">
            <div><span className="settings-status__icon"><Radio size={21} /></span><div><Badge>Personal workspace</Badge><h2>{backendConfigured ? "Secure connector runtime detected" : "Connector runtime needs setup"}</h2><p>{backendConfigured ? "Use Radar → Sources to add feed URLs, public pages, or enable YouTube." : "Add the public Supabase environment values, apply the migrations, and deploy the Radar function."}</p></div></div>
            <Button disabled>{backendConfigured ? "Configure in Radar" : "Setup required"}</Button>
          </Card>
          <section>
            <SectionHeader eyebrow="Data sources" title="Connector status" description="Only official APIs, permitted feeds, and user-supplied sources will be supported." />
            <div className="connector-list">{connectors.map((connector) => <Card className="connector-row" key={connector.name}><span className="connector-row__icon"><CircleDashed size={19} /></span><div><strong>{connector.name}</strong><small>{connector.type}</small></div><span>{connector.mode}</span><Badge>{connector.status}</Badge><Button disabled>{connector.future ? "Unavailable" : backendConfigured ? "Radar sources" : "Backend setup"}</Button></Card>)}</div>
          </section>
          <section>
            <SectionHeader eyebrow="Services" title="Production readiness" />
            <div className="service-grid"><Card><Database size={19} /><div><strong>Supabase</strong><span>Private cloud workspace and RLS active</span></div><Badge>Connected</Badge></Card><Card><MessageSquareText size={19} /><div><strong>Strategy AI</strong><span>Manual ChatGPT handoff with citation validation; no API key required</span></div><Badge>Ready</Badge></Card><Card><ShieldCheck size={19} /><div><strong>GitHub Pages</strong><span>Static deployment workflow prepared</span></div><Badge>Ready</Badge></Card></div>
          </section>
        </div>
      </div>
    </div>
  );
}
