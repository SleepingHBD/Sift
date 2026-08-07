"use client";

import {
  Check,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Link2,
  Plus,
  Rss,
  Settings2,
  Trash2,
  X,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import type { RadarConnectorSettings } from "@/lib/radar/connector-service";

type SourceEditor = "rss" | "manual" | null;

export function SourceDrawer({
  open,
  onClose,
  settings,
  onSave,
  backendConfigured,
}: {
  open: boolean;
  onClose: () => void;
  settings: RadarConnectorSettings;
  onSave: (settings: RadarConnectorSettings) => void;
  backendConfigured: boolean;
}) {
  if (!open) return null;

  return (
    <SourceDrawerContent
      onClose={onClose}
      settings={settings}
      onSave={onSave}
      backendConfigured={backendConfigured}
    />
  );
}

function SourceDrawerContent({
  onClose,
  settings,
  onSave,
  backendConfigured,
}: {
  onClose: () => void;
  settings: RadarConnectorSettings;
  onSave: (settings: RadarConnectorSettings) => void;
  backendConfigured: boolean;
}) {
  const [rssUrls, setRssUrls] = useState(settings.rssFeedUrls);
  const [manualUrls, setManualUrls] = useState(settings.manualUrls);
  const [youtubeEnabled, setYoutubeEnabled] = useState(settings.youtubeEnabled);
  const [activeEditor, setActiveEditor] = useState<SourceEditor>(null);
  const [rssDraft, setRssDraft] = useState("");
  const [manualDraft, setManualDraft] = useState("");
  const [rssError, setRssError] = useState("");
  const [manualError, setManualError] = useState("");

  function addUrl(kind: Exclude<SourceEditor, null>) {
    const value = kind === "rss" ? rssDraft.trim() : manualDraft.trim();
    const setError = kind === "rss" ? setRssError : setManualError;

    if (!isHttpUrl(value)) {
      setError("Enter a complete public URL beginning with http:// or https://");
      return;
    }

    if (kind === "rss") {
      setRssUrls((current) => uniqueUrls([...current, value]));
      setRssDraft("");
    } else {
      setManualUrls((current) => uniqueUrls([...current, value]));
      setManualDraft("");
    }
    setError("");
  }

  function save() {
    onSave({ rssFeedUrls: rssUrls, manualUrls, youtubeEnabled });
    onClose();
  }

  return (
    <div className="radar-overlay radar-overlay--drawer" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close sources" />
      <aside className="radar-drawer source-drawer">
        <header>
          <div>
            <p className="eyebrow">Radar sources</p>
            <h2 id="source-drawer-title">Connect sources</h2>
            <p>Choose where Radar should collect evidence.</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="source-setup__body">
          <div className={`source-runtime-status ${backendConfigured ? "source-runtime-status--ready" : ""}`}>
            <span className="source-runtime-status__icon">
              {backendConfigured ? <Check size={18} /> : <Settings2 size={18} />}
            </span>
            <div>
              <strong>{backendConfigured ? "Radar is ready to collect" : "Radar connection needs setup"}</strong>
              <p>{backendConfigured ? "Add at least one source below, then run your monitor." : "Complete the one-time connection setup before running a monitor."}</p>
            </div>
            {backendConfigured ? <Badge>Ready</Badge> : <Link href="/settings" className="source-setup-link">View setup <ExternalLink size={13} /></Link>}
          </div>

          <div className="source-setup__heading">
            <div>
              <span>Choose a source</span>
              <p>Add only the sources that matter for this workspace.</p>
            </div>
          </div>

          <div className="source-option-list">
            <SourceOption
              icon={<Rss size={19} />}
              title="Publication feed"
              description="Collect new articles from an RSS or Atom feed."
              status={rssUrls.length ? `${rssUrls.length} added` : "Not added"}
              active={activeEditor === "rss"}
              actionLabel={rssUrls.length ? "Edit feeds" : "Add feed"}
              onToggle={() => setActiveEditor((current) => current === "rss" ? null : "rss")}
            >
              <UrlEditor
                label="Feed URL"
                placeholder="https://publication.com/feed.xml"
                value={rssDraft}
                onChange={(value) => { setRssDraft(value); setRssError(""); }}
                onAdd={() => addUrl("rss")}
                error={rssError}
                urls={rssUrls}
                emptyMessage="No publication feeds added yet."
                onRemove={(url) => setRssUrls((current) => current.filter((item) => item !== url))}
              />
            </SourceOption>

            <SourceOption
              icon={<Link2 size={19} />}
              title="Web page or article"
              description="Import a specific public page you want to analyse."
              status={manualUrls.length ? `${manualUrls.length} added` : "Not added"}
              active={activeEditor === "manual"}
              actionLabel={manualUrls.length ? "Edit pages" : "Add page"}
              onToggle={() => setActiveEditor((current) => current === "manual" ? null : "manual")}
            >
              <UrlEditor
                label="Public page URL"
                placeholder="https://publication.com/article"
                value={manualDraft}
                onChange={(value) => { setManualDraft(value); setManualError(""); }}
                onAdd={() => addUrl("manual")}
                error={manualError}
                urls={manualUrls}
                emptyMessage="No web pages added yet."
                onRemove={(url) => setManualUrls((current) => current.filter((item) => item !== url))}
              />
            </SourceOption>

            <section className="source-option">
              <div className="source-option__summary">
                <span className="source-option__icon"><Youtube size={19} /></span>
                <div className="source-option__copy">
                  <strong>YouTube</strong>
                  <p>Find recent videos and public top-level comments.</p>
                </div>
                <Badge className={youtubeEnabled ? "source-status--active" : "source-status--quiet"}>{youtubeEnabled ? "Enabled" : "Off"}</Badge>
                <Button
                  className="source-option__action"
                  variant={youtubeEnabled ? "secondary" : "dark"}
                  onClick={() => setYoutubeEnabled((current) => !current)}
                  aria-pressed={youtubeEnabled}
                >
                  {youtubeEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
              {youtubeEnabled && !backendConfigured ? <p className="source-option__note">YouTube is selected. Finish connection setup before collecting results.</p> : null}
            </section>
          </div>

          <details className="future-connectors">
            <summary><span><CircleDashed size={17} /> More connectors</span><span>Coming later</span><ChevronDown size={16} /></summary>
            <div>
              <p>Reddit and other social platforms will appear here only when a genuine, permitted connector is available.</p>
              <div className="future-connector-tags"><span>Reddit</span><span>Instagram</span><span>TikTok</span><span>LinkedIn</span><span>X</span></div>
            </div>
          </details>
        </div>

        <footer className="source-drawer__footer">
          <span>Your choices are saved to this workspace.</span>
          <div><Button onClick={onClose}>Cancel</Button><Button variant="dark" onClick={save}>Save and close</Button></div>
        </footer>
      </aside>
    </div>
  );
}

function SourceOption({
  icon,
  title,
  description,
  status,
  active,
  actionLabel,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  active: boolean;
  actionLabel: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`source-option ${active ? "source-option--active" : ""}`}>
      <div className="source-option__summary">
        <span className="source-option__icon">{icon}</span>
        <div className="source-option__copy"><strong>{title}</strong><p>{description}</p></div>
        <Badge className={status === "Not added" ? "source-status--quiet" : "source-status--active"}>{status}</Badge>
        <Button className="source-option__action" variant={active ? "secondary" : "dark"} onClick={onToggle} aria-expanded={active}>{active ? "Done" : actionLabel}</Button>
      </div>
      {active ? <div className="source-option__editor">{children}</div> : null}
    </section>
  );
}

function UrlEditor({
  label,
  placeholder,
  value,
  onChange,
  onAdd,
  error,
  urls,
  emptyMessage,
  onRemove,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  error: string;
  urls: string[];
  emptyMessage: string;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="source-url-editor">
      <label htmlFor={`${label.toLowerCase().replaceAll(" ", "-")}-input`}>{label}</label>
      <div className="source-url-editor__add">
        <input
          id={`${label.toLowerCase().replaceAll(" ", "-")}-input`}
          type="url"
          inputMode="url"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
          aria-invalid={Boolean(error)}
        />
        <Button variant="dark" onClick={onAdd}><Plus size={15} /> Add</Button>
      </div>
      {error ? <p className="source-url-editor__error" role="alert">{error}</p> : null}
      {urls.length ? (
        <ul className="source-url-list">
          {urls.map((url) => (
            <li key={url}><Link2 size={14} /><span title={url}>{url}</span><button onClick={() => onRemove(url)} aria-label={`Remove ${url}`}><Trash2 size={14} /></button></li>
          ))}
        </ul>
      ) : <p className="source-url-editor__empty">{emptyMessage}</p>}
    </div>
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls)];
}
