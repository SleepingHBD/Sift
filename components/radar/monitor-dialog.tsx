"use client";

import { Check, ChevronDown, Code2, LoaderCircle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { MonitorCoveragePreview } from "@/components/radar/monitor-coverage";
import { Badge, Button } from "@/components/ui/primitives";
import { createDraftMonitor, radarConnectors } from "@/lib/radar/connectors";
import type { RadarConnectorSettings } from "@/lib/radar/connector-service";
import { buildBooleanQuery, interpretMonitoringIntent, splitTerms, validateBooleanQuery } from "@/lib/radar/query-builder";
import { createMonitorClientRef } from "@/lib/radar/model";
import type { MonitoringQuery, RadarSource } from "@/lib/radar/types";

interface MonitorDialogProps {
  open: boolean;
  monitor?: MonitoringQuery;
  connectorSettings: RadarConnectorSettings;
  backendConfigured: boolean;
  onClose: () => void;
  onSave: (monitor: MonitoringQuery) => Promise<void>;
  onManageSources: () => void;
}

export function MonitorDialog({
  open,
  monitor,
  connectorSettings,
  backendConfigured,
  onClose,
  onSave,
  onManageSources,
}: MonitorDialogProps) {
  const { projects } = useApp();
  const editing = Boolean(monitor);
  const initialBuilder = monitor?.builder ?? { includeAll: [], includeAny: [], exclude: [] };
  const [intent, setIntent] = useState(monitor ? initialBuilder.includeAll.join(", ") || monitor.query : "");
  const [advancedOpen, setAdvancedOpen] = useState(editing);
  const [mode, setMode] = useState<"friendly" | "boolean">(
    monitor && !initialBuilder.includeAll.length && !initialBuilder.includeAny.length && !initialBuilder.exclude.length ? "boolean" : "friendly",
  );
  const [name, setName] = useState(monitor?.name ?? "");
  const [description, setDescription] = useState(monitor?.description ?? "");
  const [projectId, setProjectId] = useState(monitor?.projectId ?? "");
  const [brand, setBrand] = useState(monitor?.brand ?? "");
  const [competitors, setCompetitors] = useState((monitor?.competitors ?? []).join(", "));
  const [includeAll, setIncludeAll] = useState(initialBuilder.includeAll.join("\n"));
  const [includeAny, setIncludeAny] = useState(initialBuilder.includeAny.join("\n"));
  const [exclude, setExclude] = useState(initialBuilder.exclude.join("\n"));
  const [rawQuery, setRawQuery] = useState(monitor?.query ?? "");
  const [language, setLanguage] = useState(monitor?.language || "Any language");
  const [market, setMarket] = useState(monitor?.market ?? "");
  const [sources, setSources] = useState<RadarSource[]>(monitor?.sources ?? []);
  const [paused, setPaused] = useState(monitor?.status === "paused");
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

  function resetNewMonitor() {
    if (editing) return;
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
    setPaused(false);
    setError("");
  }

  function close() {
    resetNewMonitor();
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!finalQuery) { setError("Describe the conversation you want to monitor."); return; }
    if (!validation.valid) { setError(validation.errors[0]); return; }

    const values = {
      name: effectiveName,
      query: finalQuery,
      description: description.trim(),
      projectId,
      brand: brand.trim() || undefined,
      competitors: splitTerms(competitors),
      keywords: builder.includeAny,
      excludedKeywords: builder.exclude,
      language,
      market: resolvedMarket,
      sources,
      builder,
      status: paused ? "paused" as const : editing ? "active" as const : "draft" as const,
    };
    const savedMonitor = monitor
      ? { ...monitor, ...values }
      : createDraftMonitor(createMonitorClientRef(), values);

    setSaving(true);
    setError("");
    try {
      await onSave(savedMonitor);
      resetNewMonitor();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `The monitor could not be ${editing ? "updated" : "saved"}.`);
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
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="monitor-dialog-title">
      <button className="radar-overlay__scrim" onClick={close} aria-label="Close monitor builder" />
      <form className="monitor-dialog monitor-dialog--simple" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">{editing ? "Monitor settings" : "New Radar monitor"}</p>
            <h2 id="monitor-dialog-title">{editing ? `Edit ${monitor?.name}` : "What should Sift listen for?"}</h2>
            <p>{editing ? "Adjust the question, query rules, and eligible sources without changing collected evidence." : "Describe it naturally. Sift will turn your request into transparent monitoring rules."}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>

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
            <div className="monitor-interpretation__head"><span><Sparkles size={14} />Sift&apos;s interpretation</span><Badge>{interpretation.subject ? "Ready to review" : "Waiting for a topic"}</Badge></div>
            {interpretation.subject ? (
              <>
                <div className="monitor-interpretation__chips">
                  <span><b>Topic</b>{interpretation.subject}</span>
                  {resolvedMarket ? <span><b>Location</b>{resolvedMarket}</span> : null}
                  {builder.exclude.map((term) => <span className="exclude" key={term}><b>Exclude</b>{term}</span>)}
                </div>
                <div className="monitor-query-summary"><span>Monitor name</span><strong>{effectiveName}</strong><code>{finalQuery}</code></div>
              </>
            ) : <p>Try something like &quot;running clubs in Singapore, excluding job posts.&quot;</p>}
          </section>

          <button className={`monitor-advanced-toggle ${advancedOpen ? "open" : ""}`} type="button" onClick={() => setAdvancedOpen((current) => !current)} aria-expanded={advancedOpen}>
            <span><SlidersHorizontal size={15} /><strong>Advanced options</strong><small>Research question, project, language, source scope, and Boolean rules</small></span><ChevronDown size={16} />
          </button>

          {advancedOpen ? <div className="monitor-advanced-panel">
            <section>
              <div className="monitor-advanced-heading"><div><strong>Research context</strong><span>Optional context helps you remember what decision this monitor should inform.</span></div></div>
              <div className="monitor-form-grid">
                <label><span>Monitor name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={interpretation.name || "Generated automatically"} /></label>
                <label><span>Project</span><select value={projectId} disabled={editing} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select>{editing ? <small>Collected evidence keeps this monitor in its current project.</small> : null}</label>
                <label className="wide"><span>Research question</span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you trying to understand or decide?" /><small>Example: What is changing in how people use running clubs to socialize?</small></label>
                <label><span>Brand</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Optional" /></label>
                <label><span>Competitors</span><input value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="Optional, separated by commas" /></label>
                <label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>Any language</option><option>English</option><option>Chinese</option><option>Malay</option><option>Tamil</option></select></label>
                <label><span>Market / location</span><input value={market} onChange={(event) => setMarket(event.target.value)} placeholder={interpretation.market || "Optional"} /></label>
                {editing ? <div className="monitor-pause-field"><span>Monitor state</span><button type="button" className={paused ? "paused" : "active"} onClick={() => setPaused((current) => !current)} aria-pressed={paused}><i>{paused ? "Paused" : "Active"}</i><small>{paused ? "Manual collection is disabled." : "Ready for permitted manual runs."}</small></button></div> : null}
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

            <section className="monitor-source-choice">
              <div><strong>Sources included in this monitor</strong><span>Leave all unchecked to use every configured permitted source. Source connections are managed separately.</span></div>
              <div>{sourceOptions.map((connector) => {
                const selected = sources.includes(connector.source);
                const unavailable = connector.state !== "available";
                return <button type="button" className={`${selected ? "selected" : ""} ${unavailable ? "unavailable" : ""}`} disabled={unavailable && !selected} key={connector.id} onClick={() => toggleSource(connector.source)}><i>{selected ? <Check size={11} /> : null}</i><span><strong>{connector.name}</strong><small>{unavailable ? selected ? "Unavailable · click to remove" : "No genuine connector" : selected ? "Included if configured" : "Available to include"}</small></span></button>;
              })}</div>
            </section>

            <MonitorCoveragePreview selectedSources={sources} settings={connectorSettings} backendConfigured={backendConfigured} onManageSources={onManageSources} />
          </div> : null}

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer><span>{editing ? "Changes affect future collection only; existing evidence is preserved." : "New monitors are saved to your private cloud workspace and start empty."}</span><div><Button type="button" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" variant="dark" disabled={!canSubmit || saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "Saving..." : editing ? "Save changes" : "Create monitor"}</Button></div></footer>
      </form>
    </div>
  );
}
