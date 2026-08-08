"use client";

import { Check, ChevronDown, Code2, LoaderCircle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button } from "@/components/ui/primitives";
import { createDraftMonitor, radarConnectors } from "@/lib/radar/connectors";
import { buildBooleanQuery, interpretMonitoringIntent, splitTerms, validateBooleanQuery } from "@/lib/radar/query-builder";
import { createMonitorClientRef } from "@/lib/radar/model";
import type { MonitoringQuery, RadarSource } from "@/lib/radar/types";

export function MonitorDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (monitor: MonitoringQuery) => Promise<void> }) {
  const { projects } = useApp();
  const [intent, setIntent] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mode, setMode] = useState<"friendly" | "boolean">("friendly");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [brand, setBrand] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [includeAll, setIncludeAll] = useState("");
  const [includeAny, setIncludeAny] = useState("");
  const [exclude, setExclude] = useState("");
  const [rawQuery, setRawQuery] = useState("");
  const [language, setLanguage] = useState("Any language");
  const [market, setMarket] = useState("");
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const interpretation = useMemo(() => interpretMonitoringIntent(intent), [intent]);
  const resolvedMarket = market.trim() || interpretation.market;
  const builder = useMemo(() => ({
    includeAll: includeAll.trim()
      ? splitTerms(includeAll)
      : [interpretation.subject, resolvedMarket].filter(Boolean),
    includeAny: splitTerms(includeAny),
    exclude: exclude.trim() ? splitTerms(exclude) : interpretation.builder.exclude,
  }), [exclude, includeAll, includeAny, interpretation, resolvedMarket]);
  const generatedQuery = buildBooleanQuery(builder);
  const finalQuery = mode === "friendly" ? generatedQuery : rawQuery.trim();
  const validation = validateBooleanQuery(finalQuery);
  const effectiveName = name.trim() || interpretation.name || (mode === "boolean" && finalQuery ? "Custom monitor" : "");
  const canSubmit = Boolean(effectiveName && finalQuery && validation.valid);
  const sourceOptions = radarConnectors.filter((connector) => ["reddit", "youtube", "rss", "news", "manual"].includes(connector.source));

  if (!open) return null;

  function resetForm() {
    setIntent("");
    setAdvancedOpen(false);
    setMode("friendly");
    setName("");
    setDescription("");
    setProjectId("");
    setBrand("");
    setCompetitors("");
    setIncludeAll("");
    setIncludeAny("");
    setExclude("");
    setRawQuery("");
    setLanguage("Any language");
    setMarket("");
    setSources([]);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!finalQuery) { setError("Describe the conversation you want to monitor."); return; }
    if (!validation.valid) { setError(validation.errors[0]); return; }
    const monitor = createDraftMonitor(createMonitorClientRef(), {
      name: effectiveName,
      query: finalQuery,
      description: description.trim() || (intent.trim() ? `Monitoring intent: ${intent.trim()}` : ""),
      projectId,
      brand: brand.trim() || undefined,
      competitors: splitTerms(competitors),
      keywords: builder.includeAny,
      excludedKeywords: builder.exclude,
      language,
      market: resolvedMarket,
      sources,
      builder,
      status: "draft",
    });
    setSaving(true);
    setError("");
    try {
      await onCreate(monitor);
      resetForm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The monitor could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSource(source: RadarSource) {
    setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  }

  function showBooleanMode() {
    if (!rawQuery.trim()) setRawQuery(generatedQuery);
    setMode("boolean");
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="new-monitor-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close monitor builder" />
      <form className="monitor-dialog monitor-dialog--simple" onSubmit={submit}>
        <header><div><p className="eyebrow">New Radar monitor</p><h2 id="new-monitor-title">What should Sift listen for?</h2><p>Describe it naturally. Sift will turn your request into transparent monitoring rules.</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>

        <div className="monitor-dialog__body">
          <label className="monitor-intent-field">
            <span>What do you want to monitor?</span>
            <textarea
              rows={3}
              value={intent}
              onChange={(event) => { setIntent(event.target.value); setError(""); }}
              placeholder="e.g. running clubs in Singapore, excluding job posts"
            />
            <small>Use a brand, competitor, campaign, product, topic, or cultural conversation.</small>
          </label>

          <section className={`monitor-interpretation ${interpretation.subject ? "has-signal" : ""}`} aria-live="polite">
            <div className="monitor-interpretation__head"><span><Sparkles size={14} />Sift’s interpretation</span><Badge>{interpretation.subject ? "Ready to review" : "Waiting for a topic"}</Badge></div>
            {interpretation.subject ? (
              <>
                <div className="monitor-interpretation__chips">
                  <span><b>Topic</b>{interpretation.subject}</span>
                  {resolvedMarket ? <span><b>Location</b>{resolvedMarket}</span> : null}
                  {builder.exclude.map((term) => <span className="exclude" key={term}><b>Exclude</b>{term}</span>)}
                </div>
                <div className="monitor-query-summary"><span>Monitor name</span><strong>{effectiveName}</strong><code>{finalQuery}</code></div>
              </>
            ) : <p>Try something like “running clubs in Singapore, excluding job posts.”</p>}
          </section>

          <button className={`monitor-advanced-toggle ${advancedOpen ? "open" : ""}`} type="button" onClick={() => setAdvancedOpen((current) => !current)} aria-expanded={advancedOpen}>
            <span><SlidersHorizontal size={15} /><strong>Advanced options</strong><small>Project, sources, language, and manual query rules</small></span><ChevronDown size={16} />
          </button>

          {advancedOpen ? <div className="monitor-advanced-panel">
            <section>
              <div className="monitor-advanced-heading"><div><strong>Workspace context</strong><span>Everything here is optional.</span></div></div>
              <div className="monitor-form-grid">
                <label><span>Monitor name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={interpretation.name || "Generated automatically"} /></label>
                <label><span>Project</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
                <label className="wide"><span>Description</span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What decision should this monitor inform?" /></label>
                <label><span>Brand</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Optional" /></label>
                <label><span>Competitors</span><input value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="Optional, separated by commas" /></label>
                <label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>Any language</option><option>English</option><option>Chinese</option><option>Malay</option><option>Tamil</option></select></label>
                <label><span>Market / location</span><input value={market} onChange={(event) => setMarket(event.target.value)} placeholder={interpretation.market || "Optional"} /></label>
              </div>
            </section>

            <section className="query-builder-panel">
              <div className="query-builder-panel__head"><div><strong>Manual query rules</strong><span>Only adjust these if Sift interpreted your request incorrectly.</span></div><div className="view-toggle"><button type="button" className={mode === "friendly" ? "active" : ""} onClick={() => setMode("friendly")}><SlidersHorizontal size={13} />Terms</button><button type="button" className={mode === "boolean" ? "active" : ""} onClick={showBooleanMode}><Code2 size={13} />Boolean</button></div></div>
              {mode === "friendly" ? <div className="query-rule-grid">
                <label><span>Include all</span><small>One term per line</small><textarea rows={4} value={includeAll} onChange={(event) => setIncludeAll(event.target.value)} placeholder={interpretation.builder.includeAll.join("\n") || "Required terms"} /></label>
                <label><span>Include any</span><small>At least one appears</small><textarea rows={4} value={includeAny} onChange={(event) => setIncludeAny(event.target.value)} placeholder={"Optional term\nAnother term"} /></label>
                <label><span>Exclude</span><small>Remove matching results</small><textarea rows={4} value={exclude} onChange={(event) => setExclude(event.target.value)} placeholder={interpretation.builder.exclude.join("\n") || "Optional exclusions"} /></label>
              </div> : <label className="raw-query-field"><span>Boolean query</span><textarea rows={5} value={rawQuery} onChange={(event) => setRawQuery(event.target.value)} /><small>Supports AND, OR, NOT, exact phrases, and parentheses.</small></label>}
              <div className={`query-preview ${validation.valid ? "valid" : "invalid"}`}><div><span>{validation.valid ? <Check size={13} /> : <Code2 size={13} />}Internal query</span><code>{finalQuery || "Describe a topic above"}</code></div><Badge>{validation.valid && finalQuery ? "Valid" : "Needs a topic"}</Badge></div>
            </section>

            <section className="monitor-source-choice"><div><strong>Sources to prepare</strong><span>Selections do not imply a live connection.</span></div><div>{sourceOptions.map((connector) => <button type="button" className={sources.includes(connector.source as RadarSource) ? "selected" : ""} key={connector.id} onClick={() => toggleSource(connector.source as RadarSource)}><i>{sources.includes(connector.source as RadarSource) ? <Check size={11} /> : null}</i><span><strong>{connector.name}</strong><small>{connector.state === "available" ? "Available to configure" : "Not connected"}</small></span></button>)}</div></section>
          </div> : null}

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer><span>New monitors are saved to your private cloud workspace and start empty.</span><div><Button type="button" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" variant="dark" disabled={!canSubmit || saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "Saving…" : "Create monitor"}</Button></div></footer>
      </form>
    </div>
  );
}
