"use client";

import { Beaker, Bookmark, ChevronDown, ExternalLink, FileText, Flag, FolderKanban, Images, Link2, Search, SlidersHorizontal, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge, Button, Card, SectionHeader } from "@/components/ui/primitives";
import type { EvidenceDestination, RadarMention, TopicIntelligence } from "@/lib/radar/types";
import { formatNumber } from "@/lib/utils";

type SortOption = "newest" | "oldest" | "engagement" | "relevance";

function highlight(content: string, query: string) {
  const cleaned = query.trim();
  if (!cleaned) return content;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = content.split(new RegExp(`(${escaped})`, "ig"));
  return parts.map((part, index) => part.toLowerCase() === cleaned.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : <Fragment key={`${part}-${index}`}>{part}</Fragment>);
}

interface MentionFeedProps {
  mentions: RadarMention[];
  topics: TopicIntelligence[];
  sourceFilter: string;
  topicFilter: string;
  keywordFilter: string;
  projectLabel: string;
  savedIds: string[];
  importantIds: string[];
  onSourceFilter: (source: string) => void;
  onTopicFilter: (topic: string) => void;
  onKeywordFilter: (keyword: string) => void;
  onOpenMention: (mention: RadarMention) => void;
  onToggleSaved: (mentionId: string) => void;
  onToggleImportant: (mentionId: string) => void;
  onUseEvidence: (mention: RadarMention) => void;
  onQuickLink: (mention: RadarMention, destination: EvidenceDestination, label: string) => void;
}

export function MentionFeed({ mentions, topics, sourceFilter, topicFilter, keywordFilter, projectLabel, savedIds, importantIds, onSourceFilter, onTopicFilter, onKeywordFilter, onOpenMention, onToggleSaved, onToggleImportant, onUseEvidence, onQuickLink }: MentionFeedProps) {
  const [search, setSearch] = useState("");
  const [sentiment, setSentiment] = useState("all");
  const [minimumEngagement, setMinimumEngagement] = useState(0);
  const [sort, setSort] = useState<SortOption>("newest");
  const [visibleCount, setVisibleCount] = useState(12);
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState("");

  const sources = useMemo(() => [...new Set(mentions.map((mention) => mention.platform))], [mentions]);
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

  function quickLink(mention: RadarMention, destination: EvidenceDestination, label: string) {
    onQuickLink(mention, destination, label);
    setNotice(`Added to ${label}. Original mention ID retained.`);
    window.setTimeout(() => setNotice(""), 2200);
  }

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
      <SectionHeader eyebrow="Evidence stream" title="Conversation feed" description={`${filtered.length} conversations match the current date range and filters.`} />
      <div className="conversation-search-row">
        <label className="conversation-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search within this monitor, e.g. “running clubs”" />{search ? <button onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button> : null}</label>
        <Button onClick={() => setShowFilters(!showFilters)} variant={showFilters ? "dark" : "secondary"}><SlidersHorizontal size={15} />Filters{activeFilterCount ? <Badge>{activeFilterCount}</Badge> : null}</Button>
        <label className="feed-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="engagement">Highest engagement</option><option value="relevance">Most relevant</option></select><ChevronDown size={13} /></label>
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
      {notice ? <div className="radar-toast"><Link2 size={14} />{notice}</div> : null}

      <div className="mention-feed">
        {filtered.slice(0, visibleCount).map((mention) => {
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
                    <button title={savedIds.includes(mention.id) ? "Remove saved mention" : "Save mention"} onClick={(event) => { event.stopPropagation(); onToggleSaved(mention.id); }}><Bookmark size={14} fill={savedIds.includes(mention.id) ? "currentColor" : "none"} /><span>Save</span></button>
                    <button title="Add to project" onClick={(event) => { event.stopPropagation(); quickLink(mention, "project", projectLabel); }}><FolderKanban size={14} /><span>Project</span></button>
                    <button title="Add to research" onClick={(event) => { event.stopPropagation(); quickLink(mention, "research", "Research collection"); }}><FileText size={14} /><span>Research</span></button>
                    <button title="Add to inspiration" onClick={(event) => { event.stopPropagation(); quickLink(mention, "inspiration", "Inspiration library"); }}><Images size={14} /><span>Inspiration</span></button>
                    <button className="evidence-action" title="Use as evidence" onClick={(event) => { event.stopPropagation(); onUseEvidence(mention); }}><Beaker size={14} /><span>Evidence</span></button>
                    <button title="Mark important" onClick={(event) => { event.stopPropagation(); onToggleImportant(mention.id); }}><Flag size={14} fill={importantIds.includes(mention.id) ? "currentColor" : "none"} /><span>Important</span></button>
                    {mention.url ? <a href={mention.url} target="_blank" rel="noreferrer" title="Open original" onClick={(event) => event.stopPropagation()}><ExternalLink size={14} /></a> : <button disabled title="No original source URL is available"><ExternalLink size={14} /></button>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {!filtered.length ? <Card className="empty-state conversation-empty"><Search size={29} /><strong>No conversations matched these filters.</strong><span>Clear one or more filters, lower the engagement threshold, or try a broader search.</span><Button onClick={clearFilters}>Clear all filters</Button></Card> : null}
      </div>
      {visibleCount < filtered.length ? <div className="load-more-row"><Button onClick={() => setVisibleCount((count) => count + 12)}>Load 12 more <span>{filtered.length - visibleCount} remaining</span></Button></div> : null}
    </section>
  );
}
