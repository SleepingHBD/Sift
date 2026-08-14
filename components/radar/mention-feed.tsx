"use client";

import { BookOpenText, Bookmark, ChevronDown, ExternalLink, Flag, Search, SlidersHorizontal, X } from "lucide-react";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { useRadarConversations } from "@/components/radar/use-radar-conversations";
import { Badge, Button, Card, SectionHeader } from "@/components/ui/primitives";
import type { DateBounds, MonitoringQuery, RadarConversationSort, RadarMention, TopicIntelligence } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

function highlight(content: string, query: string) {
  const cleaned = query.trim();
  if (!cleaned) return content;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = content.split(new RegExp(`(${escaped})`, "ig"));
  return parts.map((part, index) => part.toLowerCase() === cleaned.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : <Fragment key={`${part}-${index}`}>{part}</Fragment>);
}

interface MentionFeedProps {
  mentions: RadarMention[];
  monitor: MonitoringQuery;
  bounds: DateBounds;
  refreshKey: string;
  topics: TopicIntelligence[];
  sourceFilter: string;
  topicFilter: string;
  keywordFilter: string;
  savedIds: string[];
  importantIds: string[];
  onSourceFilter: (source: string) => void;
  onTopicFilter: (topic: string) => void;
  onKeywordFilter: (keyword: string) => void;
  onOpenMention: (mention: RadarMention) => void;
  onToggleSaved: (mentionId: string) => void;
  onToggleImportant: (mentionId: string) => void;
  onSendToNotebook: (mention: RadarMention) => void;
  onMentionsLoaded: (mentions: RadarMention[]) => void | Promise<void>;
}

export function MentionFeed({ mentions, monitor, bounds, refreshKey, topics, sourceFilter, topicFilter, keywordFilter, savedIds, importantIds, onSourceFilter, onTopicFilter, onKeywordFilter, onOpenMention, onToggleSaved, onToggleImportant, onSendToNotebook, onMentionsLoaded }: MentionFeedProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sentiment, setSentiment] = useState("all");
  const [minimumEngagement, setMinimumEngagement] = useState(0);
  const [sort, setSort] = useState<RadarConversationSort>("newest");
  const [visibleCount, setVisibleCount] = useState(12);
  const [showFilters, setShowFilters] = useState(false);
  const boundsStart = bounds.start.getTime();
  const boundsEnd = bounds.end.getTime();
  const conversationRequest = useMemo(() => monitor.cloudId ? {
    monitor,
    bounds: { start: new Date(boundsStart), end: new Date(boundsEnd) },
    search: deferredSearch,
    source: sourceFilter,
    sentiment,
    topic: topicFilter,
    keyword: keywordFilter,
    minimumEngagement,
    sort,
  } : null, [boundsEnd, boundsStart, deferredSearch, keywordFilter, minimumEngagement, monitor, sentiment, sort, sourceFilter, topicFilter]);
  const server = useRadarConversations(conversationRequest, refreshKey, onMentionsLoaded);

  const sources = useMemo(() => [...new Set([...mentions, ...server.mentions].map((mention) => mention.platform))], [mentions, server.mentions]);
  const filtered = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    const keywordValue = keywordFilter.trim().toLowerCase();
    const result = mentions.filter((mention) => {
      const haystack = `${mention.content} ${mention.author} ${mention.topics.join(" ")} ${mention.keywords.join(" ")}`.toLowerCase();
      return (!searchValue || haystack.includes(searchValue))
        && (sourceFilter === "all" || mention.platform === sourceFilter)
        && (sentiment === "all" || mention.sentiment === sentiment)
        && (!topicFilter || mention.topics.includes(topicFilter))
        && (!keywordValue || mention.keywords.some((item) => item.toLowerCase().includes(keywordValue)) || mention.content.toLowerCase().includes(keywordValue))
        && mention.engagement >= minimumEngagement;
    });
    return result.sort((a, b) => {
      if (sort === "oldest") return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      if (sort === "engagement") return b.engagement - a.engagement;
      if (sort === "relevance") return b.relevance - a.relevance;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [keywordFilter, mentions, minimumEngagement, search, sentiment, sort, sourceFilter, topicFilter]);
  const usesCompleteHistory = server.status === "ready";
  const displayed = usesCompleteHistory ? server.mentions : filtered.slice(0, visibleCount);
  const matchingCount = usesCompleteHistory ? server.total : filtered.length;

  function clearFilters() {
    setSearch("");
    onSourceFilter("all");
    setSentiment("all");
    onTopicFilter("");
    onKeywordFilter("");
    setMinimumEngagement(0);
  }

  const activeFilterCount = [sourceFilter !== "all", sentiment !== "all", Boolean(topicFilter), Boolean(keywordFilter), minimumEngagement > 0].filter(Boolean).length;

  return (
    <section className="radar-section mentions-section" id="mention-feed">
      <SectionHeader eyebrow="Evidence stream" title="Conversation feed" description={`${matchingCount} conversations match the current date range and filters.`} />
      <div className="conversation-search-row">
        <label className="conversation-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search within this monitor, e.g. “running clubs”" />{search ? <button onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button> : null}</label>
        <Button onClick={() => setShowFilters(!showFilters)} variant={showFilters ? "dark" : "secondary"}><SlidersHorizontal size={15} />Filters{activeFilterCount ? <Badge>{activeFilterCount}</Badge> : null}</Button>
        <label className="feed-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as RadarConversationSort)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="engagement">Highest engagement</option><option value="relevance">Most relevant</option></select><ChevronDown size={13} /></label>
      </div>

      {showFilters ? (
        <Card className="mention-filter-panel">
          <label><span>Source</span><select value={sourceFilter} onChange={(event) => onSourceFilter(event.target.value)}><option value="all">All sources</option>{sources.map((source) => <option value={source} key={source}>{source[0].toUpperCase() + source.slice(1)}</option>)}</select></label>
          <label><span>Sentiment</span><select value={sentiment} onChange={(event) => setSentiment(event.target.value)}><option value="all">All sentiment</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select></label>
          <label><span>Topic</span><select value={topicFilter} onChange={(event) => onTopicFilter(event.target.value)}><option value="">All topics</option>{topics.map((topic) => <option value={topic.name} key={topic.id}>{topic.name}</option>)}</select></label>
          <label><span>Keyword contains</span><input value={keywordFilter} onChange={(event) => onKeywordFilter(event.target.value)} placeholder="price, community…" /></label>
          <label><span>Minimum engagement</span><input type="number" min={0} step={50} value={minimumEngagement} onChange={(event) => setMinimumEngagement(Math.max(0, Number(event.target.value)))} /></label>
          <Button onClick={clearFilters}>Clear filters</Button>
        </Card>
      ) : null}

      {sourceFilter !== "all" || topicFilter || keywordFilter ? <div className="active-filter-row">{sourceFilter !== "all" ? <button onClick={() => onSourceFilter("all")}>Source: {sourceFilter}<X size={12} /></button> : null}{topicFilter ? <button onClick={() => onTopicFilter("")}>Topic: {topicFilter}<X size={12} /></button> : null}{keywordFilter ? <button onClick={() => onKeywordFilter("")}>Keyword: {keywordFilter}<X size={12} /></button> : null}</div> : null}
      {server.status === "loading" ? <div className="radar-run-notice" role="status"><span>Loading complete conversation history from Supabase...</span></div> : null}
      {server.error ? <div className="radar-run-notice radar-run-notice--error" role="alert"><span>{server.error} Showing the conversations already loaded in this browser.</span></div> : null}
      {usesCompleteHistory ? <div className="conversation-history-status"><span>Complete database results</span><small>Stable pages keep this view accurate while new records arrive.</small></div> : null}

      <div className="mention-feed">
        {displayed.map((mention) => {
          const date = new Date(mention.publishedAt).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });
          return (
            <Card className="mention-card mention-card--interactive" key={mention.id} role="button" tabIndex={0} onClick={() => onOpenMention(mention)} onKeyDown={(event) => { if (event.key === "Enter") onOpenMention(mention); }}>
              <div className={`platform-mark platform-mark--${mention.platform}`}>{mention.platform.slice(0, 1).toUpperCase()}</div>
              <div className="mention-card__body">
                <div className="mention-card__meta"><strong>{mention.author}</strong><span>{mention.sourceLabel} · {date}</span><Badge className={`sentiment-badge sentiment-badge--${mention.sentiment}`}>{mention.sentiment}</Badge></div>
                <p>{highlight(mention.content, search)}</p>
                <div className="mention-taxonomy"><div>{mention.topics.map((topic) => <button key={topic} onClick={(event) => { event.stopPropagation(); onTopicFilter(topic); }}>{topic}</button>)}</div><div>{mention.keywords.slice(0, 4).map((item) => <span key={item}>#{item.replaceAll(" ", "-")}</span>)}</div></div>
                <div className="mention-card__footer">
                  <span><b>{formatNumber(mention.engagement)}</b> estimated engagement · {mention.relevance}% relevant</span>
                  <div className="mention-actions">
                    <button className="evidence-action" title="Add to a notebook page" onClick={(event) => { event.stopPropagation(); onSendToNotebook(mention); }}><BookOpenText size={14} /><span>Notebook</span></button>
                    <button title={savedIds.includes(mention.id) ? "Remove saved mention" : "Save mention"} onClick={(event) => { event.stopPropagation(); onToggleSaved(mention.id); }}><Bookmark size={14} fill={savedIds.includes(mention.id) ? "currentColor" : "none"} /><span>{savedIds.includes(mention.id) ? "Saved" : "Save"}</span></button>
                    <button title={importantIds.includes(mention.id) ? "Remove important marker" : "Mark important"} onClick={(event) => { event.stopPropagation(); onToggleImportant(mention.id); }}><Flag size={14} fill={importantIds.includes(mention.id) ? "currentColor" : "none"} /><span>{importantIds.includes(mention.id) ? "Important" : "Mark important"}</span></button>
                    {mention.url ? <a href={mention.url} target="_blank" rel="noreferrer" title="Open original" onClick={(event) => event.stopPropagation()}><ExternalLink size={14} /></a> : <button disabled title="No original source URL is available"><ExternalLink size={14} /></button>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {server.status !== "loading" && !displayed.length ? <Card className="empty-state conversation-empty"><Search size={29} /><strong>No conversations matched these filters.</strong><span>Clear one or more filters, lower the engagement threshold, or try a broader search.</span><Button onClick={clearFilters}>Clear all filters</Button></Card> : null}
      </div>
      {usesCompleteHistory && server.hasMore ? <div className="load-more-row"><Button disabled={server.loadingMore} onClick={() => void server.loadMore()}>{server.loadingMore ? "Loading..." : "Load 24 more"} <span>{Math.max(0, server.total - server.mentions.length)} remaining</span></Button></div> : null}
      {!usesCompleteHistory && visibleCount < filtered.length ? <div className="load-more-row"><Button onClick={() => setVisibleCount((count) => count + 12)}>Load 12 more <span>{filtered.length - visibleCount} remaining</span></Button></div> : null}
    </section>
  );
}
