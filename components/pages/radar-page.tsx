"use client";

import {
  BarChart3,
  Bookmark,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  MessageSquareText,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  Shapes,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { EvidenceDialog } from "@/components/radar/evidence-dialog";
import { MentionDetailDrawer } from "@/components/radar/mention-detail-drawer";
import { MentionFeed } from "@/components/radar/mention-feed";
import { MonitorDialog } from "@/components/radar/monitor-dialog";
import { RadarSentimentChart, RadarSourceChart, RadarVolumeChart } from "@/components/radar/radar-charts";
import { RadarEvidenceView } from "@/components/radar/radar-evidence-view";
import { SourceDrawer } from "@/components/radar/source-drawer";
import { SpikeDrawer } from "@/components/radar/spike-drawer";
import { StrategistPanel } from "@/components/radar/strategist-panel";
import { TopicIntelligence } from "@/components/radar/topic-intelligence";
import { useRadarState } from "@/components/radar/use-radar-state";
import { Badge, Button, Card, Metric, PageIntro, SectionHeader } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";
import { enrichConnectorMentions, getRunnableSources, isRadarConnectorBackendConfigured, runRadarConnectors } from "@/lib/radar/connector-service";
import { buildRadarAnalytics } from "@/lib/radar/processing";
import type { DateRangeKey, EvidenceDestination, MonitorRun, MonitoringQuery, RadarEvidenceLink, RadarMention } from "@/lib/radar/types";
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
  const { savedIds, toggleSaved, projects, activeProjectId } = useApp();
  const { monitors, addMonitor, mentionsByMonitor, connectorSettings, saveConnectorSettings, completeMonitorRun, recordMonitorRun, evidenceLinks, addEvidenceLink, notes, saveNote, importantIds, toggleImportant } = useRadarState();
  const [activeMonitorId, setActiveMonitorId] = useState("");
  const [activeView, setActiveView] = useState<RadarView>("overview");
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");
  const [customDates, setCustomDates] = useState(() => defaultCustomDates());
  const [activeTopic, setActiveTopic] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [selectedSpikeId, setSelectedSpikeId] = useState("");
  const [selectedMention, setSelectedMention] = useState<RadarMention | null>(null);
  const [evidenceMention, setEvidenceMention] = useState<RadarMention | null>(null);
  const [runState, setRunState] = useState<"idle" | "running">("idle");
  const [runNotice, setRunNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const activeMonitor = monitors.find((monitor) => monitor.id === activeMonitorId) ?? monitors[0];
  const allMentions = useMemo(() => activeMonitor ? mentionsByMonitor[activeMonitor.id] ?? [] : [], [activeMonitor, mentionsByMonitor]);
  const analyticsNow = useMemo(() => new Date(), []);
  const baseAnalytics = useMemo(() => buildRadarAnalytics(allMentions, dateRange, analyticsNow, customDates), [allMentions, analyticsNow, customDates, dateRange]);
  const analytics = useMemo(() => activeTopic
    ? buildRadarAnalytics(allMentions, dateRange, analyticsNow, customDates, activeTopic)
    : baseAnalytics, [activeTopic, allMentions, analyticsNow, baseAnalytics, customDates, dateRange]);
  const selectedSpike = analytics.spikes.find((spike) => spike.id === selectedSpikeId) ?? null;
  const relatedMentions = selectedMention
    ? allMentions.filter((mention) => mention.id !== selectedMention.id && mention.topics.some((topic) => selectedMention.topics.includes(topic))).sort((a, b) => b.engagement - a.engagement).slice(0, 4)
    : [];
  const evidenceCount = new Set(allMentions.filter((mention) => savedIds.includes(mention.id) || importantIds.includes(mention.id) || evidenceLinks.some((link) => link.mentionId === mention.id)).map((mention) => mention.id)).size;
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectLabel = activeProject?.name ?? "Current project";
  const backendConfigured = isRadarConnectorBackendConfigured();
  const runnableSources = activeMonitor ? getRunnableSources(activeMonitor, connectorSettings) : [];
  const canRun = backendConfigured && runnableSources.length > 0 && runState !== "running";

  const views: { id: RadarView; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "topics", label: "Topics", icon: Shapes, count: baseAnalytics.topics.length },
    { id: "mentions", label: "Mentions", icon: MessageSquareText, count: baseAnalytics.currentMentions.length },
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

  function createMonitor(monitor: MonitoringQuery) {
    addMonitor(monitor);
    selectMonitor(monitor.id);
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

  function quickEvidenceLink(mention: RadarMention, destination: EvidenceDestination, label: string) {
    addEvidenceLink({ id: `evidence-${Date.now()}`, mentionId: mention.id, destination, destinationLabel: label, createdAt: new Date().toISOString() });
  }

  async function runMonitor() {
    if (!activeMonitor || !canRun) return;
    const startedAt = new Date().toISOString();
    setRunState("running");
    setRunNotice(null);
    try {
      const result = await runRadarConnectors(activeMonitor, connectorSettings, activeProject ? {
        id: activeProject.id,
        name: activeProject.name,
        description: activeProject.description,
        market: activeProject.market,
      } : undefined);
      const processed = enrichConnectorMentions(result.mentions, activeMonitor);
      const completedAt = new Date().toISOString();
      const run: MonitorRun = {
        id: result.runId,
        monitorId: activeMonitor.id,
        connectorIds: runnableSources,
        status: "completed",
        startedAt,
        completedAt,
        mentionsFetched: result.mentions.length,
        mentionsCreated: processed.length,
        persisted: result.persisted,
        sourceResults: result.sourceResults,
      };
      completeMonitorRun(activeMonitor.id, processed, run);
      const failedSources = result.sourceResults.filter((source) => source.status === "failed");
      setRunNotice({
        tone: failedSources.length || !result.persisted ? "error" : "success",
        message: processed.length
          ? `Collected ${processed.length} genuine source record${processed.length === 1 ? "" : "s"}.${failedSources.length ? ` ${failedSources.length} source failed; open Sources for details.` : ""}${!result.persisted ? ` Records are saved on this device, but cloud persistence failed${result.persistenceError ? `: ${result.persistenceError}` : "."}` : ""}`
          : failedSources.length ? failedSources.map((source) => source.message).filter(Boolean).join(" ") || "The configured sources could not be collected." : "The run completed, but no records matched this monitor.",
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : "The monitor run failed.";
      recordMonitorRun({
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
      });
      setRunNotice({ tone: "error", message });
    } finally {
      setRunState("idle");
    }
  }

  if (!activeMonitor) {
    return (
      <div className="page radar-page-v3">
        <PageIntro
          eyebrow="Radar / Social listening"
          title="Read the room."
          description="Monitor a brand, competitor, campaign, topic, product, or cultural conversation."
        >
          <Button onClick={() => setSourceDrawerOpen(true)}><Settings2 size={15} />Sources</Button>
          <Button variant="dark" onClick={() => setMonitorDialogOpen(true)}><Plus size={16} />Create monitor</Button>
        </PageIntro>
        <EmptyState
          icon={Radio}
          eyebrow="Your listening workspace"
          title="Nothing on the radar yet."
          description="Create a monitor to track a brand, competitor, campaign, topic, or cultural conversation. Analytics will appear only after evidence is collected."
          actions={(
            <>
              <Button variant="dark" onClick={() => setMonitorDialogOpen(true)}><Plus size={15} />Create monitor</Button>
              <Button onClick={() => setSourceDrawerOpen(true)}><Settings2 size={15} />View sources</Button>
            </>
          )}
        />
        <MonitorDialog open={monitorDialogOpen} onClose={() => setMonitorDialogOpen(false)} onCreate={createMonitor} />
        <SourceDrawer open={sourceDrawerOpen} onClose={() => setSourceDrawerOpen(false)} settings={connectorSettings} onSave={saveConnectorSettings} backendConfigured={backendConfigured} />
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
        <Button onClick={() => setSourceDrawerOpen(true)}><Settings2 size={15} />Sources</Button>
        <Button variant="dark" onClick={() => setMonitorDialogOpen(true)}><Plus size={16} />New monitor</Button>
      </PageIntro>

      <Card className="monitor-command-bar monitor-command-bar--calm">
        <div className="monitor-command-bar__select">
          <span className="monitor-signal"><Radio size={15} /></span>
          <label><span>Monitor</span><select value={activeMonitor.id} onChange={(event) => selectMonitor(event.target.value)}>{monitors.map((monitor) => <option value={monitor.id} key={monitor.id}>{monitor.name}</option>)}</select></label>
          <ChevronDown size={13} />
        </div>
        <div className="monitor-command-bar__query"><span>Listening for</span><code>{activeMonitor.query}</code></div>
        <div className="monitor-command-bar__context">
          <Badge>{allMentions.length ? `${allMentions.length} mentions` : activeMonitor.lastRunAt ? "0 results" : "No data"}</Badge>
          <span>{activeMonitor.market || "Any market"}</span>
          <span>{activeMonitor.language || "Any language"}</span>
        </div>
        <Button disabled={!canRun} title={!backendConfigured ? "Configure Supabase before running this monitor" : !runnableSources.length ? "Configure at least one eligible source" : undefined} onClick={runMonitor}>{runState === "running" ? <RefreshCw className="spin" size={14} /> : <Play size={14} />}{runState === "running" ? "Collecting" : "Run monitor"}</Button>
      </Card>

      {runNotice ? <div className={`radar-run-notice radar-run-notice--${runNotice.tone}`} role="status"><span>{runNotice.message}</span><button onClick={() => setRunNotice(null)} aria-label="Dismiss run status">×</button></div> : null}

      {activeMonitor.dataMode === "empty" ? (
        <Card className="radar-empty-monitor">
          <span className="radar-empty-monitor__signal"><Radio size={28} /></span>
          <Badge>No data</Badge>
          <h2>{activeMonitor.lastRunAt ? "No conversations matched this monitor." : "Nothing on the radar yet."}</h2>
          <p>{activeMonitor.lastRunAt ? "The source run completed without matching records. Review the query or source selection and try again." : "Connect a permitted source to begin collecting conversations for this monitor."}</p>
          <div>
            <Button variant="dark" disabled={!canRun} title={!backendConfigured ? "Configure Supabase first" : !runnableSources.length ? "Configure a source first" : undefined} onClick={runMonitor}>{runState === "running" ? <RefreshCw className="spin" size={14} /> : <Play size={14} />}{runState === "running" ? "Collecting" : "Run monitor"}</Button>
            <Button onClick={() => setSourceDrawerOpen(true)}><Settings2 size={14} />Configure sources</Button>
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
            <div className="radar-date-toolbar radar-date-toolbar--quiet">
              <div className="segmented" role="group" aria-label="Date range">{rangeLabels.map((range) => <button key={range.id} className={dateRange === range.id ? "active" : ""} onClick={() => setDateRange(range.id)}>{range.label}</button>)}</div>
              {dateRange === "custom" ? <div className="custom-date-fields"><CalendarDays size={14} /><input type="date" value={customDates.start} max={customDates.end} onChange={(event) => setCustomDates((current) => ({ ...current, start: event.target.value }))} /><span>to</span><input type="date" value={customDates.end} min={customDates.start} max={todayDateInput()} onChange={(event) => setCustomDates((current) => ({ ...current, end: event.target.value }))} /></div> : null}
              <div className="radar-date-toolbar__scope"><span>{activeTopic ? `Scoped to ${activeTopic}` : "All conversation"}</span>{activeTopic ? <button onClick={() => setActiveTopic("")}>Clear</button> : null}</div>
            </div>
          ) : null}

          {activeView === "overview" ? (
            <div className="radar-view radar-view--overview">
              <div className="radar-primary-metrics">
                <Metric label="Total mentions" value={formatNumber(analytics.metrics.totalMentions)} delta={`${analytics.metrics.mentionGrowth >= 0 ? "+" : ""}${analytics.metrics.mentionGrowth}% vs prior period`} tone={analytics.metrics.mentionGrowth >= 0 ? "positive" : "negative"} />
                <Metric label="Mention growth" value={`${analytics.metrics.mentionGrowth >= 0 ? "+" : ""}${analytics.metrics.mentionGrowth}%`} delta="Directional change" tone={analytics.metrics.mentionGrowth >= 0 ? "positive" : "negative"} />
                <Metric label="Estimated engagement" value={formatNumber(analytics.metrics.engagement)} delta="Normalized across sources" />
                <Metric label="Conversation sentiment" value={`${analytics.metrics.positive}% positive`} delta={`${analytics.metrics.negative}% negative`} tone={analytics.metrics.positive >= analytics.metrics.negative ? "positive" : "negative"} />
              </div>

              <dl className="radar-secondary-metrics">
                <div><dt>Neutral</dt><dd>{analytics.metrics.neutral}%</dd></div>
                <div><dt>Negative</dt><dd>{analytics.metrics.negative}%</dd></div>
                <div><dt>Unique authors</dt><dd>{formatNumber(analytics.metrics.uniqueAuthors)}</dd></div>
                <div><dt>Active sources</dt><dd>{analytics.metrics.activeSources}</dd></div>
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

      <MonitorDialog open={monitorDialogOpen} onClose={() => setMonitorDialogOpen(false)} onCreate={createMonitor} />
      <SourceDrawer open={sourceDrawerOpen} onClose={() => setSourceDrawerOpen(false)} settings={connectorSettings} onSave={saveConnectorSettings} backendConfigured={backendConfigured} />
      <SpikeDrawer spike={selectedSpike} mentions={analytics.currentMentions} onClose={() => setSelectedSpikeId("")} onOpenMention={(mention) => { setSelectedSpikeId(""); setSelectedMention(mention); }} />
      <MentionDetailDrawer mention={selectedMention} related={relatedMentions} note={selectedMention ? notes[selectedMention.id] ?? "" : ""} links={selectedMention ? evidenceLinks.filter((link) => link.mentionId === selectedMention.id) : []} saved={Boolean(selectedMention && savedIds.includes(selectedMention.id))} important={Boolean(selectedMention && importantIds.includes(selectedMention.id))} onClose={() => setSelectedMention(null)} onSaveNote={(note) => selectedMention && saveNote(selectedMention.id, note)} onToggleSaved={() => selectedMention && toggleSaved(selectedMention.id)} onToggleImportant={() => selectedMention && toggleImportant(selectedMention.id)} onUseEvidence={() => selectedMention && setEvidenceMention(selectedMention)} onOpenRelated={setSelectedMention} onFilterKeyword={inspectKeyword} />
      <EvidenceDialog mention={evidenceMention} onClose={() => setEvidenceMention(null)} onSave={(link: RadarEvidenceLink) => addEvidenceLink(link)} />
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
