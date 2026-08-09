"use client";

import {
  BarChart3,
  Bookmark,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  Shapes,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { DeleteMonitorDialog } from "@/components/radar/delete-monitor-dialog";
import { EvidenceDialog } from "@/components/radar/evidence-dialog";
import { MentionDetailDrawer } from "@/components/radar/mention-detail-drawer";
import { MentionFeed } from "@/components/radar/mention-feed";
import { MonitorAnalyticsCoverage } from "@/components/radar/monitor-analytics-coverage";
import { MonitorCoveragePreview } from "@/components/radar/monitor-coverage";
import { MonitorDialog } from "@/components/radar/monitor-dialog";
import { RadarImportNotice } from "@/components/radar/radar-import-notice";
import { RadarSentimentChart, RadarSourceChart, RadarVolumeChart } from "@/components/radar/radar-charts";
import { RadarEvidenceView } from "@/components/radar/radar-evidence-view";
import { RunDiagnostics } from "@/components/radar/run-diagnostics";
import { SourceDrawer } from "@/components/radar/source-drawer";
import { SpikeDrawer } from "@/components/radar/spike-drawer";
import { StrategistPanel } from "@/components/radar/strategist-panel";
import { TopicIntelligence } from "@/components/radar/topic-intelligence";
import { useMonitorSummary } from "@/components/radar/use-monitor-summary";
import { useRadarState } from "@/components/radar/use-radar-state";
import { Badge, Button, Card, Metric, PageIntro, SectionHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import { deleteRadarMonitor, enrichConnectorMentions, getRunnableSources, isRadarConnectorBackendConfigured, RadarRunConflictError, runRadarConnectors } from "@/lib/radar/connector-service";
import { buildRadarAnalytics } from "@/lib/radar/processing";
import type { DateRangeKey, EvidenceDestination, MonitorRun, MonitoringQuery, RadarMention } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

type RadarView = "overview" | "topics" | "mentions" | "evidence";

const rangeLabels: { id: DateRangeKey; label: string }[] = [
  { id: "24h", label: "24 Hours" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "custom", label: "Custom" },
];

export function RadarPage() {
  const { removeSavedIds, projects, researchItems, inspirationItems } = useApp();
  const { monitors, addMonitor, editMonitor, removeMonitor, mentionsByMonitor, runs, connectorSettings, saveConnectorSettings, completeMonitorRun, recordMonitorRun, savedIds, toggleSaved, evidenceLinks, addEvidenceLink, removeEvidenceLink, notes, saveNote, importantIds, toggleImportant, annotationError, clearAnnotationError, cloudStatus, cloudError, retryCloud, historyTruncated, pendingLocalRadar, pendingLocalAnnotations, importPendingRadar } = useRadarState(projects, researchItems, inspirationItems, removeSavedIds);
  const [activeMonitorId, setActiveMonitorId] = useState("");
  const [activeView, setActiveView] = useState<RadarView>("overview");
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");
  const [customDates, setCustomDates] = useState(() => defaultCustomDates());
  const [activeTopic, setActiveTopic] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<MonitoringQuery | undefined>();
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [resumeMonitorAfterSources, setResumeMonitorAfterSources] = useState(false);
  const [selectedSpikeId, setSelectedSpikeId] = useState("");
  const [selectedMention, setSelectedMention] = useState<RadarMention | null>(null);
  const [evidenceMention, setEvidenceMention] = useState<RadarMention | null>(null);
  const [runState, setRunState] = useState<"idle" | "running">("idle");
  const [runNotice, setRunNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (window.location.hash !== "#new-monitor") return;
    const openFromLink = window.setTimeout(() => {
      setEditingMonitor(undefined);
      setMonitorDialogOpen(true);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }, 0);
    return () => window.clearTimeout(openFromLink);
  }, []);

  const activeMonitor = monitors.find((monitor) => monitor.id === activeMonitorId) ?? monitors[0];
  const allMentions = useMemo(() => activeMonitor ? mentionsByMonitor[activeMonitor.id] ?? [] : [], [activeMonitor, mentionsByMonitor]);
  const analyticsNow = useMemo(() => new Date(), []);
  const baseAnalytics = useMemo(() => buildRadarAnalytics(allMentions, dateRange, analyticsNow, customDates), [allMentions, analyticsNow, customDates, dateRange]);
  const analytics = useMemo(() => activeTopic
    ? buildRadarAnalytics(allMentions, dateRange, analyticsNow, customDates, activeTopic)
    : baseAnalytics, [activeTopic, allMentions, analyticsNow, baseAnalytics, customDates, dateRange]);
  const { summary: monitorSummary, status: monitorSummaryStatus, error: monitorSummaryError } = useMonitorSummary({
    monitorId: activeMonitor?.cloudId,
    bounds: analytics.bounds,
    topic: activeTopic || undefined,
    refreshKey: `${activeMonitor?.lastRunAt ?? ""}:${allMentions.length}`,
  });
  const reportedMetrics = monitorSummary?.metrics ?? analytics.metrics;
  const selectedSpike = analytics.spikes.find((spike) => spike.id === selectedSpikeId) ?? null;
  const relatedMentions = selectedMention
    ? allMentions.filter((mention) => mention.id !== selectedMention.id && mention.topics.some((topic) => selectedMention.topics.includes(topic))).sort((a, b) => b.engagement - a.engagement).slice(0, 4)
    : [];
  const evidenceCount = new Set(allMentions.filter((mention) => savedIds.includes(mention.id) || importantIds.includes(mention.id) || evidenceLinks.some((link) => link.mentionId === mention.id)).map((mention) => mention.id)).size;
  const monitorProject = activeMonitor?.projectId ? projects.find((project) => project.id === activeMonitor.projectId) : undefined;
  const projectLabel = monitorProject?.name ?? "Personal Radar";
  const backendConfigured = isRadarConnectorBackendConfigured();
  const runnableSources = activeMonitor ? getRunnableSources(activeMonitor, connectorSettings) : [];
  const activeCloudRun = activeMonitor ? runs.some((run) => run.monitorId === activeMonitor.id && run.status === "running") : false;
  const canRun = backendConfigured && activeMonitor?.status !== "paused" && runnableSources.length > 0 && runState !== "running" && !activeCloudRun;
  const runDisabledReason = activeMonitor?.status === "paused"
    ? "Resume this monitor in Monitor settings before collecting."
    : !backendConfigured
      ? "Configure Supabase before running this monitor."
      : !runnableSources.length
        ? "Configure at least one eligible source."
        : activeCloudRun
          ? "This monitor already has a collection in progress."
        : undefined;

  const views: { id: RadarView; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "topics", label: "Topics", icon: Shapes, count: baseAnalytics.topics.length },
    { id: "mentions", label: "Mentions", icon: MessageSquareText, count: monitorSummary?.metrics.totalMentions ?? analytics.currentMentions.length },
    { id: "evidence", label: "Evidence", icon: Bookmark, count: evidenceCount },
  ];

  function selectMonitor(id: string) {
    setActiveMonitorId(id);
    setActiveView("overview");
    setActiveTopic("");
    setSourceFilter("all");
    setKeywordFilter("");
    setSelectedSpikeId("");
  }

  async function saveMonitor(monitor: MonitoringQuery) {
    const saved = editingMonitor ? await editMonitor(monitor) : await addMonitor(monitor);
    setEditingMonitor(undefined);
    selectMonitor(saved.id);
  }

  function openNewMonitor() {
    setEditingMonitor(undefined);
    setMonitorDialogOpen(true);
  }

  function openMonitorSettings() {
    if (!activeMonitor) return;
    setEditingMonitor(activeMonitor);
    setMonitorDialogOpen(true);
  }

  function closeMonitorDialog() {
    setMonitorDialogOpen(false);
    setEditingMonitor(undefined);
  }

  function openSourceDrawer() {
    setResumeMonitorAfterSources(false);
    setSourceDrawerOpen(true);
  }

  function manageSourcesFromMonitor() {
    setMonitorDialogOpen(false);
    setResumeMonitorAfterSources(true);
    setSourceDrawerOpen(true);
  }

  function closeSourceDrawer() {
    setSourceDrawerOpen(false);
    if (resumeMonitorAfterSources) {
      setResumeMonitorAfterSources(false);
      setMonitorDialogOpen(true);
    }
  }

  function inspectSource(source: string) {
    setSourceFilter(source);
    setActiveView("mentions");
    window.setTimeout(() => document.getElementById("mention-feed")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function inspectKeyword(keyword: string) {
    setKeywordFilter(keyword);
    setSelectedMention(null);
    setActiveView("mentions");
    window.setTimeout(() => document.getElementById("mention-feed")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function quickEvidenceLink(mention: RadarMention, destination: EvidenceDestination, label: string) {
    await addEvidenceLink({ id: `evidence-${Date.now()}`, mentionId: mention.id, destination, destinationLabel: label, createdAt: new Date().toISOString() });
  }

  async function runMonitor() {
    if (!activeMonitor || !canRun) return;
    const startedAt = new Date().toISOString();
    setRunState("running");
    setRunNotice(null);
    try {
      const result = await runRadarConnectors(activeMonitor, connectorSettings, monitorProject ? {
        id: monitorProject.id,
        name: monitorProject.name,
        description: monitorProject.description,
        market: monitorProject.market,
      } : undefined);
      const processed = enrichConnectorMentions(result.mentions, activeMonitor);
      const completedAt = new Date().toISOString();
      const run: MonitorRun = {
        id: result.runId,
        monitorId: activeMonitor.id,
        connectorIds: runnableSources,
        status: result.sourceResults.every((source) => source.status === "failed") ? "failed" : "completed",
        startedAt,
        completedAt,
        mentionsFetched: result.mentionsFetched,
        mentionsCreated: result.mentionsCreated,
        mentionsUpdated: result.mentionsUpdated,
        duplicatesRemoved: result.duplicatesRemoved,
        durationMs: result.durationMs,
        quota: result.quota,
        incremental: result.incremental,
        cursorAdvancedSources: result.cursorAdvancedSources,
        triggerType: "manual",
        persisted: result.persisted,
        sourceResults: result.sourceResults,
      };
      await completeMonitorRun(activeMonitor.id, processed, run);
      const failedSources = result.sourceResults.filter((source) => source.status === "failed");
      setRunNotice({
        tone: failedSources.length || !result.persisted ? "error" : "success",
        message: processed.length
          ? `Collected ${processed.length} genuine source record${processed.length === 1 ? "" : "s"}.${failedSources.length ? ` ${failedSources.length} source failed; expand Collection health for details.` : ""}${!result.persisted ? ` These results are temporary and may be lost because cloud persistence failed${result.persistenceError ? `: ${result.persistenceError}` : "."}` : ""}`
          : !result.persisted
            ? `The source run completed, but cloud persistence failed${result.persistenceError ? `: ${result.persistenceError}` : "."}`
            : failedSources.length
              ? failedSources.map((source) => source.message).filter(Boolean).join(" ") || "The configured sources could not be collected."
              : result.incremental
                ? "The run completed successfully. No new records appeared since the previous checkpoint."
                : "The run completed, but no records matched this monitor.",
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : "The monitor run failed.";
      if (!(error instanceof RadarRunConflictError)) {
        await recordMonitorRun({
          id: `run-${Date.now()}`,
          monitorId: activeMonitor.id,
          connectorIds: runnableSources,
          status: "failed",
          startedAt,
          completedAt,
          mentionsFetched: 0,
          mentionsCreated: 0,
          persisted: false,
          sourceResults: runnableSources.map((source) => ({ source, status: "failed", count: 0, message })),
          error: message,
        }).catch(() => undefined);
      }
      setRunNotice({ tone: "error", message });
    } finally {
      setRunState("idle");
    }
  }

  async function confirmDeleteMonitor() {
    if (!activeMonitor || deleteState === "deleting") return;
    const monitorId = activeMonitor.id;
    const mentionIds = (mentionsByMonitor[monitorId] ?? []).map((mention) => mention.id);
    const nextMonitor = monitors.find((monitor) => monitor.id !== monitorId);
    setDeleteState("deleting");
    setDeleteError("");

    try {
      if (!backendConfigured) throw new Error("Connect Supabase before deleting this cloud monitor.");
      await deleteRadarMonitor(monitorId, monitorProject ? {
        id: monitorProject.id,
        name: monitorProject.name,
        description: monitorProject.description,
        market: monitorProject.market,
      } : undefined);
      removeSavedIds(mentionIds);
      removeMonitor(monitorId);
      setActiveMonitorId(nextMonitor?.id ?? "");
      setActiveView("overview");
      setActiveTopic("");
      setSourceFilter("all");
      setKeywordFilter("");
      setSelectedSpikeId("");
      setSelectedMention(null);
      setEvidenceMention(null);
      setRunNotice(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The monitor could not be deleted.";
      setDeleteError(`Nothing was deleted. ${message}`);
    } finally {
      setDeleteState("idle");
    }
  }

  if (cloudStatus === "loading") {
    return (
      <div className="page radar-page-v3">
        <PageIntro eyebrow="Radar / Social listening" title="Read the room." description="Loading your private listening workspace from Supabase." />
        <EmptyState icon={RefreshCw} eyebrow="Cloud workspace" title="Loading Radar…" description="Sift is retrieving your monitors, conversation history, topics, and run records." />
      </div>
    );
  }

  if (cloudStatus === "error") {
    return (
      <div className="page radar-page-v3">
        <PageIntro eyebrow="Radar / Social listening" title="Radar could not be loaded." description="Sift will not replace unavailable cloud data with an empty or browser-only workspace." />
        <EmptyState icon={Radio} eyebrow="Cloud connection" title="Your Radar data is still in Supabase." description={cloudError || "The authenticated Radar repository is temporarily unavailable."} actions={<Button variant="dark" onClick={retryCloud}><RefreshCw size={15} />Try again</Button>} />
      </div>
    );
  }

  if (!activeMonitor) {
    return (
      <div className="page radar-page-v3">
        <PageIntro
          eyebrow="Radar / Social listening"
          title="Read the room."
          description="Monitor a brand, competitor, campaign, topic, product, or cultural conversation."
        >
          <Button onClick={openSourceDrawer}><Settings2 size={15} />Sources</Button>
          <Button variant="dark" onClick={openNewMonitor}><Plus size={16} />Create monitor</Button>
        </PageIntro>
        {pendingLocalRadar || pendingLocalAnnotations ? <RadarImportNotice payload={pendingLocalRadar} annotations={pendingLocalAnnotations} onImport={importPendingRadar} /> : null}
        <EmptyState
          icon={Radio}
          eyebrow="Your listening workspace"
          title="Nothing on the radar yet."
          description="Create a monitor to track a brand, competitor, campaign, topic, or cultural conversation. Analytics will appear only after evidence is collected."
          actions={(
            <>
              <Button variant="dark" onClick={openNewMonitor}><Plus size={15} />Create monitor</Button>
              <Button onClick={openSourceDrawer}><Settings2 size={15} />View sources</Button>
            </>
          )}
        />
        <MonitorDialog key="new-monitor" open={monitorDialogOpen} connectorSettings={connectorSettings} backendConfigured={backendConfigured} onClose={closeMonitorDialog} onSave={saveMonitor} onManageSources={manageSourcesFromMonitor} />
        <SourceDrawer open={sourceDrawerOpen} onClose={closeSourceDrawer} settings={connectorSettings} onSave={saveConnectorSettings} backendConfigured={backendConfigured} />
      </div>
    );
  }

  return (
    <div className="page radar-page-v3">
      <PageIntro
        eyebrow="Radar / Social listening"
        title="Read the room."
        description="Start with the signal. Drill into topics, conversations, and evidence only when you need them."
      >
        <Button onClick={openSourceDrawer}><Settings2 size={15} />Sources</Button>
        <Button variant="dark" onClick={openNewMonitor}><Plus size={16} />New monitor</Button>
      </PageIntro>

      {pendingLocalRadar || pendingLocalAnnotations ? <RadarImportNotice payload={pendingLocalRadar} annotations={pendingLocalAnnotations} onImport={importPendingRadar} /> : null}
      {historyTruncated ? <div className="radar-run-notice" role="status"><span>Radar loaded the newest 5,000 conversations. Older records remain safely stored in Supabase.</span></div> : null}
      {annotationError ? <div className="radar-run-notice radar-run-notice--error" role="alert"><span>{annotationError}</span><button onClick={clearAnnotationError} aria-label="Dismiss Radar save error">×</button></div> : null}

      <Card className="monitor-command-bar monitor-command-bar--calm">
        <div className="monitor-command-bar__select">
          <span className="monitor-signal"><Radio size={15} /></span>
          <label><span>Monitor</span><select value={activeMonitor.id} onChange={(event) => selectMonitor(event.target.value)}>{monitors.map((monitor) => <option value={monitor.id} key={monitor.id}>{monitor.name}</option>)}</select></label>
          <ChevronDown size={13} />
        </div>
        <div className="monitor-command-bar__query"><span>Listening for</span><code>{activeMonitor.query}</code></div>
        <div className="monitor-command-bar__context">
          <Badge>{(activeMonitor.totalMentionCount ?? allMentions.length) ? `${formatNumber(activeMonitor.totalMentionCount ?? allMentions.length)} stored records` : activeMonitor.lastRunAt ? "0 results" : "No data"}</Badge>
          <span>{activeMonitor.market || "Any market"}</span>
          <span>{activeMonitor.language || "Any language"}</span>
        </div>
        <div className="monitor-command-bar__actions">
          <Button onClick={openMonitorSettings}><Pencil size={14} />Edit</Button>
          <Button disabled={!canRun} title={runDisabledReason} onClick={runMonitor}>{runState === "running" ? <RefreshCw className="spin" size={14} /> : <Play size={14} />}{runState === "running" ? "Collecting" : "Run monitor"}</Button>
          <Button size="icon" className="monitor-delete-trigger" disabled={runState === "running"} title="Delete this monitor" aria-label={`Delete ${activeMonitor.name}`} onClick={() => { setDeleteError(""); setDeleteDialogOpen(true); }}><Trash2 size={15} /></Button>
        </div>
      </Card>

      <MonitorCoveragePreview selectedSources={activeMonitor.sources} settings={connectorSettings} backendConfigured={backendConfigured} onManageSources={openSourceDrawer} collapsible />
      <RunDiagnostics monitorId={activeMonitor.id} selectedSources={activeMonitor.sources} runs={runs} />

      {runNotice ? <div className={`radar-run-notice radar-run-notice--${runNotice.tone}`} role="status"><span>{runNotice.message}</span><button onClick={() => setRunNotice(null)} aria-label="Dismiss run status">×</button></div> : null}

      {activeMonitor.dataMode === "empty" ? (
        <Card className="radar-empty-monitor">
          <span className="radar-empty-monitor__signal"><Radio size={28} /></span>
          <Badge>No data</Badge>
          <h2>{activeMonitor.lastRunAt ? "No conversations matched this monitor." : "Nothing on the radar yet."}</h2>
          <p>{activeMonitor.lastRunAt ? "The source run completed without matching records. Review the query or source selection and try again." : "Connect a permitted source to begin collecting conversations for this monitor."}</p>
          <div>
            <Button variant="dark" disabled={!canRun} title={runDisabledReason} onClick={runMonitor}>{runState === "running" ? <RefreshCw className="spin" size={14} /> : <Play size={14} />}{runState === "running" ? "Collecting" : "Run monitor"}</Button>
            <Button onClick={openSourceDrawer}><Settings2 size={14} />Configure sources</Button>
          </div>
          <small>{!backendConfigured ? "Deploy the secure connector function and add the public Supabase environment values to enable collection." : !runnableSources.length ? "Add an RSS feed, a public URL, or enable YouTube in Sources." : `${runnableSources.length} source${runnableSources.length === 1 ? " is" : "s are"} ready for this monitor.`}</small>
        </Card>
      ) : (
        <>
          <nav className="radar-view-tabs" aria-label="Radar workspace views">
            {views.map((view) => {
              const Icon = view.icon;
              return <button key={view.id} className={activeView === view.id ? "active" : ""} aria-current={activeView === view.id ? "page" : undefined} onClick={() => setActiveView(view.id)}><Icon size={14} /><span>{view.label}</span>{view.count !== undefined ? <b>{view.count}</b> : null}</button>;
            })}
          </nav>

          {activeView !== "evidence" ? (
            <>
              <div className="radar-date-toolbar radar-date-toolbar--quiet">
                <div className="segmented" role="group" aria-label="Date range">{rangeLabels.map((range) => <button key={range.id} className={dateRange === range.id ? "active" : ""} onClick={() => setDateRange(range.id)}>{range.label}</button>)}</div>
                {dateRange === "custom" ? <div className="custom-date-fields"><CalendarDays size={14} /><input type="date" value={customDates.start} max={customDates.end} onChange={(event) => setCustomDates((current) => ({ ...current, start: event.target.value }))} /><span>to</span><input type="date" value={customDates.end} min={customDates.start} max={todayDateInput()} onChange={(event) => setCustomDates((current) => ({ ...current, end: event.target.value }))} /></div> : null}
                <div className="radar-date-toolbar__scope"><span>{activeTopic ? `Detected topic: ${activeTopic}` : "All connector-observed records"}</span>{activeTopic ? <button onClick={() => setActiveTopic("")}>Clear</button> : null}</div>
              </div>
              <MonitorAnalyticsCoverage summary={monitorSummary} status={monitorSummaryStatus} error={monitorSummaryError} fallbackRecords={analytics.metrics.totalMentions} fallbackSources={analytics.metrics.activeSources} historyTruncated={historyTruncated} />
            </>
          ) : null}

          {activeView === "overview" ? (
            <div className="radar-view radar-view--overview">
              <div className="radar-primary-metrics">
                <Metric label="Observed records" value={formatNumber(reportedMetrics.totalMentions)} delta="Collected in the selected period" />
                <Metric label="Period-over-period change" value={`${reportedMetrics.mentionGrowth >= 0 ? "+" : ""}${reportedMetrics.mentionGrowth}%`} delta={`${formatNumber(monitorSummary?.previousMentions ?? analytics.previousMentions.length)} records in the comparison period`} tone={reportedMetrics.mentionGrowth >= 0 ? "positive" : "negative"} />
                <Metric label="Estimated interaction score" value={formatNumber(reportedMetrics.engagement)} delta="Likes, comments, shares and views normalized" />
                <Metric label="Detected sentiment" value={`${reportedMetrics.positive}% positive`} delta={`${reportedMetrics.negative}% negative · automated classification`} tone={reportedMetrics.positive >= reportedMetrics.negative ? "positive" : "negative"} />
              </div>

              <dl className="radar-secondary-metrics">
                <div><dt>Neutral classification</dt><dd>{reportedMetrics.neutral}%</dd></div>
                <div><dt>Negative classification</dt><dd>{reportedMetrics.negative}%</dd></div>
                <div><dt>Distinct named authors</dt><dd>{formatNumber(reportedMetrics.uniqueAuthors)}</dd></div>
                <div><dt>Sources represented</dt><dd>{reportedMetrics.activeSources}</dd></div>
              </dl>

              <div className="radar-primary-grid radar-primary-grid--focus">
                <section className="radar-focus-chart">
                  <SectionHeader
                    eyebrow="Conversation movement"
                    title={analytics.spikes.length ? `${analytics.spikes.length} unusual increase${analytics.spikes.length === 1 ? "" : "s"} detected` : "Conversation is within its recent range"}
                    description="Select a coral marker to inspect the evidence behind the increase."
                    action={<div className="chart-legend"><span><i className="chart-key chart-key--acid" />Mentions</span><span><i className="chart-key chart-key--dash" />Baseline</span></div>}
                  />
                  <RadarVolumeChart data={analytics.volume} onSpike={setSelectedSpikeId} />
                </section>
                <aside className="conversation-spikes-card conversation-spikes-card--flat">
                  <div className="conversation-spikes-card__head"><div><p className="eyebrow">Spikes</p><h3>Periods to investigate</h3></div><BarChart3 size={17} /></div>
                  {analytics.spikes.length ? analytics.spikes.slice(0, 4).map((spike, index) => <button key={spike.id} onClick={() => setSelectedSpikeId(spike.id)}><span>0{index + 1}</span><div><strong>{spike.label}</strong><small>{spike.topTopics[0]?.name ?? "Mixed topics"} · {spike.mentions} mentions</small></div><b>+{spike.growth}%</b></button>) : <div className="mini-empty"><TrendingUp size={20} /><strong>No unusual spikes</strong><span>Volume is close to its recent baseline.</span></div>}
                  <button className="spike-panel-link" onClick={() => setActiveView("topics")}>Explore conversation drivers <Shapes size={12} /></button>
                </aside>
              </div>

              <StrategistPanel observations={analytics.observations} mentions={analytics.currentMentions} onOpenMention={setSelectedMention} />
            </div>
          ) : null}

          {activeView === "topics" ? (
            <div className="radar-view radar-view--topics">
              <TopicIntelligence topics={baseAnalytics.topics} mentions={baseAnalytics.currentMentions} activeTopic={activeTopic} onSelect={(topic) => { setActiveTopic(topic); setSelectedSpikeId(""); }} onOpenMention={setSelectedMention} onInspectMentions={() => setActiveView("mentions")} />
              <div className="radar-topic-context-grid">
                <section><SectionHeader eyebrow="Sentiment" title="How tone is moving" /><RadarSentimentChart data={analytics.sentiment} /></section>
                <section><SectionHeader eyebrow="Sources" title="Where signals appear" description="Select a bar to inspect mentions." /><RadarSourceChart data={analytics.sources} onSelect={inspectSource} /></section>
                <section className="keyword-card keyword-card--flat"><SectionHeader eyebrow="Keywords" title="Language shaping the period" description="Select a term to inspect matching mentions." /><div className="keyword-ranking">{analytics.keywords.slice(0, 10).map((keyword, index) => <button key={keyword.keyword} onClick={() => inspectKeyword(keyword.keyword)}><span>0{index + 1}</span><strong>{keyword.keyword}</strong><small>{keyword.count}</small><b>{keyword.growth >= 0 ? "+" : ""}{keyword.growth}%</b></button>)}</div></section>
              </div>
            </div>
          ) : null}

          {activeView === "mentions" ? (
            <div className="radar-view radar-view--mentions">
              <MentionFeed mentions={baseAnalytics.currentMentions} topics={baseAnalytics.topics} sourceFilter={sourceFilter} topicFilter={activeTopic} keywordFilter={keywordFilter} projectLabel={projectLabel} savedIds={savedIds} importantIds={importantIds} onSourceFilter={setSourceFilter} onTopicFilter={setActiveTopic} onKeywordFilter={setKeywordFilter} onOpenMention={setSelectedMention} onToggleSaved={toggleSaved} onToggleImportant={toggleImportant} onUseEvidence={setEvidenceMention} onQuickLink={quickEvidenceLink} />
            </div>
          ) : null}

          {activeView === "evidence" ? (
            <div className="radar-view radar-view--evidence">
              <RadarEvidenceView mentions={allMentions} savedIds={savedIds} importantIds={importantIds} links={evidenceLinks} onOpenMention={setSelectedMention} onUseEvidence={setEvidenceMention} />
            </div>
          ) : null}
        </>
      )}

      <MonitorDialog key={editingMonitor?.id ?? "new-monitor"} open={monitorDialogOpen} monitor={editingMonitor} connectorSettings={connectorSettings} backendConfigured={backendConfigured} onClose={closeMonitorDialog} onSave={saveMonitor} onManageSources={manageSourcesFromMonitor} />
      <DeleteMonitorDialog open={deleteDialogOpen} monitor={activeMonitor} mentionCount={allMentions.length} deleting={deleteState === "deleting"} error={deleteError} onClose={() => { if (deleteState !== "deleting") { setDeleteDialogOpen(false); setDeleteError(""); } }} onConfirm={confirmDeleteMonitor} />
      <SourceDrawer open={sourceDrawerOpen} onClose={closeSourceDrawer} settings={connectorSettings} onSave={saveConnectorSettings} backendConfigured={backendConfigured} />
      <SpikeDrawer spike={selectedSpike} mentions={analytics.currentMentions} onClose={() => setSelectedSpikeId("")} onOpenMention={(mention) => { setSelectedSpikeId(""); setSelectedMention(mention); }} />
      <MentionDetailDrawer mention={selectedMention} related={relatedMentions} note={selectedMention ? notes[selectedMention.id] ?? "" : ""} links={selectedMention ? evidenceLinks.filter((link) => link.mentionId === selectedMention.id) : []} saved={Boolean(selectedMention && savedIds.includes(selectedMention.id))} important={Boolean(selectedMention && importantIds.includes(selectedMention.id))} onClose={() => setSelectedMention(null)} onSaveNote={(note) => selectedMention ? saveNote(selectedMention.id, note) : Promise.resolve()} onRemoveEvidence={removeEvidenceLink} onToggleSaved={() => { if (selectedMention) void toggleSaved(selectedMention.id); }} onToggleImportant={() => { if (selectedMention) void toggleImportant(selectedMention.id); }} onUseEvidence={() => selectedMention && setEvidenceMention(selectedMention)} onOpenRelated={setSelectedMention} onFilterKeyword={inspectKeyword} />
      <EvidenceDialog mention={evidenceMention} onClose={() => setEvidenceMention(null)} onSave={addEvidenceLink} />
    </div>
  );
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function defaultCustomDates() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
