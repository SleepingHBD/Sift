"use client";

import { CalendarClock, Check, ChevronDown, Code2, Database, LoaderCircle, ShieldCheck, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { MonitorCoveragePreview } from "@/components/radar/monitor-coverage";
import { Badge, Button } from "@/components/ui/primitives";
import { createDraftMonitor, radarConnectors } from "@/lib/radar/connectors";
import type { RadarConnectorSettings } from "@/lib/radar/connector-service";
import { getCloudRadarRetentionPreview } from "@/lib/radar/repository";
import { buildBooleanQuery, interpretMonitoringIntent, splitTerms, validateBooleanQuery } from "@/lib/radar/query-builder";
import { createMonitorClientRef } from "@/lib/radar/model";
import type { MonitoringQuery, RadarRetentionDays, RadarRetentionPreview, RadarScheduleFrequency, RadarSource } from "@/lib/radar/types";

interface MonitorDialogProps {
  open: boolean;
  monitor?: MonitoringQuery;
  connectorSettings: RadarConnectorSettings;
  backendConfigured: boolean;
  schedulerAvailable: boolean;
  onClose: () => void;
  onSave: (monitor: MonitoringQuery) => Promise<void>;
  onManageSources: () => void;
}

const scheduleHours = Array.from({ length: 24 }, (_, hour) => hour);
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function retentionValue(value: string): RadarRetentionDays {
  const parsed = Number(value);
  return parsed === 90 || parsed === 180 || parsed === 365 ? parsed : null;
}

function RetentionPreviewPanel({ monitorId, retentionDays }: { monitorId: string; retentionDays: Exclude<RadarRetentionDays, null> }) {
  const [preview, setPreview] = useState<RadarRetentionPreview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getCloudRadarRetentionPreview(monitorId, retentionDays)
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [monitorId, retentionDays]);

  if (failed) return <p>Sift could not load the preview. The preference can still be saved; nothing will be deleted.</p>;
  if (!preview) return <p><LoaderCircle className="spin" size={13} />Checking this monitor&apos;s history...</p>;
  return <div className="retention-preview__metrics"><span><b>{preview.candidateMentions}</b>Older than {retentionDays} days</span><span><b>{preview.protectedMentions}</b>Protected evidence</span><span><b>{preview.eligibleMentions}</b>Would be eligible</span></div>;
}

export function MonitorDialog({
  open,
  monitor,
  connectorSettings,
  backendConfigured,
  schedulerAvailable,
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
  const [scheduleFrequency, setScheduleFrequency] = useState<RadarScheduleFrequency>(monitor?.scheduleFrequency ?? "manual");
  const [scheduleHour, setScheduleHour] = useState(monitor?.scheduleHour ?? 9);
  const [scheduleWeekday, setScheduleWeekday] = useState(monitor?.scheduleWeekday ?? 1);
  const [scheduleTimezone] = useState(monitor?.scheduleTimezone ?? browserTimezone);
  const [retentionDays, setRetentionDays] = useState<RadarRetentionDays>(monitor?.retentionDays ?? null);
  const [retentionEnabled, setRetentionEnabled] = useState(monitor?.retentionEnabled ?? false);
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
  const retentionCanActivate = editing
    && Boolean(monitor?.cloudId)
    && schedulerAvailable
    && !paused
    && scheduleFrequency !== "manual"
    && retentionDays !== null;

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
    setScheduleFrequency("manual");
    setScheduleHour(9);
    setScheduleWeekday(1);
    setRetentionDays(null);
    setRetentionEnabled(false);
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
      scheduleFrequency,
      scheduleHour,
      scheduleWeekday,
      scheduleTimezone,
      scheduleEnabled: schedulerAvailable && !paused && scheduleFrequency !== "manual",
      nextScheduledRunAt: monitor?.nextScheduledRunAt,
      scheduleFailureCount: monitor?.scheduleFailureCount ?? 0,
      lastScheduleError: monitor?.lastScheduleError,
      retentionDays,
      retentionEnabled: retentionCanActivate && retentionEnabled,
      lastRetentionRunAt: monitor?.lastRetentionRunAt,
      lastRetentionDeletedCount: monitor?.lastRetentionDeletedCount ?? 0,
      lastRetentionError: monitor?.lastRetentionError,
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
            <span><SlidersHorizontal size={15} /><strong>Advanced options</strong><small>Context, query rules, sources, schedule preference, and retention</small></span><ChevronDown size={16} />
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
                {editing ? <div className="monitor-pause-field"><span>Monitor state</span><button type="button" className={paused ? "paused" : "active"} onClick={() => setPaused((current) => { const next = !current; if (next) setRetentionEnabled(false); return next; })} aria-pressed={paused}><i>{paused ? "Paused" : "Active"}</i><small>{paused ? "Manual collection is disabled." : "Ready for permitted manual runs."}</small></button></div> : null}
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

            <section className="monitor-lifecycle-settings">
              <div className="monitor-advanced-heading"><div><strong>Automation &amp; storage</strong><span>Choose when Radar should collect and how long raw conversation should remain.</span></div></div>
              <div className="monitor-lifecycle-grid">
                <div className="monitor-lifecycle-card">
                  <div className="monitor-lifecycle-card__heading"><i><CalendarClock size={15} /></i><div><strong>Automatic runs</strong><span>{schedulerAvailable ? "Collected by Sift's trusted cloud scheduler." : "Cloud scheduling is not available in this environment."}</span></div><Badge>{scheduleFrequency === "manual" ? "Manual" : paused ? "Paused" : schedulerAvailable ? "Active" : "Unavailable"}</Badge></div>
                  <label><span>Frequency</span><select value={scheduleFrequency} onChange={(event) => { const next = event.target.value as RadarScheduleFrequency; setScheduleFrequency(next); if (next === "manual") setRetentionEnabled(false); }}><option value="manual">Manual only</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
                  {scheduleFrequency !== "manual" ? <div className="monitor-schedule-fields">
                    {scheduleFrequency === "weekly" ? <label><span>Day</span><select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(Number(event.target.value))}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label> : null}
                    <label><span>Preferred time</span><select value={scheduleHour} onChange={(event) => setScheduleHour(Number(event.target.value))}>{scheduleHours.map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label>
                  </div> : null}
                  <p className="monitor-lifecycle-note"><ShieldCheck size={13} />{scheduleFrequency === "manual" ? "This monitor runs only when you press Run monitor." : paused ? "Resume this monitor to activate its saved schedule." : !schedulerAvailable ? "The schedule will remain off until the trusted scheduler is available." : monitor?.nextScheduledRunAt ? `Next run: ${new Date(monitor.nextScheduledRunAt).toLocaleString()}.` : "The first run time will be calculated when you save."} Time zone: {scheduleTimezone}.</p>
                  {monitor?.lastScheduleError ? <p className="monitor-lifecycle-warning">Last scheduled attempt: {monitor.lastScheduleError}</p> : null}
                </div>

                <div className="monitor-lifecycle-card">
                  <div className="monitor-lifecycle-card__heading"><i><Database size={15} /></i><div><strong>Conversation retention</strong><span>Only unprotected raw conversations can become eligible.</span></div><Badge>{retentionEnabled && retentionCanActivate ? "Active" : retentionDays ? "Preview" : "Off"}</Badge></div>
                  <label><span>Keep unprotected raw conversations</span><select value={retentionDays ?? "forever"} onChange={(event) => { const next = retentionValue(event.target.value); setRetentionDays(next); if (next === null) setRetentionEnabled(false); }}><option value="forever">Forever</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label>
                  <div className="retention-preview" aria-live="polite">
                    {retentionDays === null ? <p>Nothing is eligible for retention cleanup while <strong>Forever</strong> is selected.</p> : !monitor?.cloudId ? <p>Save the monitor first. Sift can then preview its existing conversation history.</p> : <RetentionPreviewPanel key={`${monitor.cloudId}:${retentionDays}`} monitorId={monitor.cloudId} retentionDays={retentionDays} />}
                  </div>
                  <label htmlFor="monitor-retention-enabled" aria-label="Enable automatic retention" className={`retention-opt-in ${!retentionCanActivate ? "disabled" : ""}`}>
                    <input id="monitor-retention-enabled" type="checkbox" checked={retentionEnabled && retentionCanActivate} disabled={!retentionCanActivate} onChange={(event) => setRetentionEnabled(event.target.checked)} />
                    <span><strong>Enable automatic retention</strong><small>After a successful scheduled run, remove at most 250 eligible conversations and record an audit.</small></span>
                  </label>
                  <p className="monitor-lifecycle-note"><ShieldCheck size={13} />Saved, cited, noted, tagged, important, trend-linked, and reviewed conversations are always protected.</p>
                  {!editing ? <p className="monitor-lifecycle-note">Save this monitor first, then return here to opt in.</p> : scheduleFrequency === "manual" ? <p className="monitor-lifecycle-note">Choose a daily or weekly schedule before enabling retention.</p> : null}
                  {monitor?.lastRetentionRunAt ? <p className="monitor-lifecycle-note">Last audit: {new Date(monitor.lastRetentionRunAt).toLocaleString()} · {monitor.lastRetentionDeletedCount} removed.</p> : null}
                  {monitor?.lastRetentionError ? <p className="monitor-lifecycle-warning">Last retention attempt: {monitor.lastRetentionError}</p> : null}
                </div>
              </div>
            </section>
          </div> : null}

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer><span>{editing ? "Future retention affects only eligible raw conversations; strategic evidence stays protected." : "New monitors are saved to your private cloud workspace and start empty."}</span><div><Button type="button" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" variant="dark" disabled={!canSubmit || saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "Saving..." : editing ? "Save changes" : "Create monitor"}</Button></div></footer>
      </form>
    </div>
  );
}
