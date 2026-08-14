"use client";

import { ArrowRight, Check, GitBranch, Lightbulb, Link2, LoaderCircle, X } from "lucide-react";
import { useMemo } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  buildEmergingThreads,
  strategyConnectionLabels,
  suggestNotebookConnections,
} from "@/lib/strategy-pipeline/connections";
import type {
  StrategyConnectionSuggestion,
  StrategySessionConnectionRecord,
  StrategySessionTurnRecord,
} from "@/lib/strategy-pipeline/types";

function turnExcerpt(turn: StrategySessionTurnRecord, length = 84) {
  const sourceTitle = turn.sources[0]?.source.title;
  const value = turn.metadata.capture_only === true && sourceTitle ? sourceTitle : turn.content;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

function scrollToTurn(turnId: string) {
  const element = document.getElementById(`notebook-turn-${turnId}`);
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
  element?.classList.add("is-highlighted");
  window.setTimeout(() => element?.classList.remove("is-highlighted"), 1300);
}

export function NotebookConnectionsPanel({
  turns,
  connections,
  busyKey,
  onAcceptSuggestion,
  onDismissSuggestion,
  onRemoveConnection,
}: {
  turns: StrategySessionTurnRecord[];
  connections: StrategySessionConnectionRecord[];
  busyKey: string;
  onAcceptSuggestion: (suggestion: StrategyConnectionSuggestion) => Promise<void>;
  onDismissSuggestion: (suggestion: StrategyConnectionSuggestion) => Promise<void>;
  onRemoveConnection: (connection: StrategySessionConnectionRecord) => Promise<void>;
}) {
  const turnMap = useMemo(() => new Map(turns.map((turn) => [turn.id, turn])), [turns]);
  const accepted = useMemo(() => connections.filter((connection) => connection.status === "accepted"), [connections]);
  const suggestions = useMemo(() => suggestNotebookConnections(turns, connections), [connections, turns]);
  const threads = useMemo(() => buildEmergingThreads(turns, connections), [connections, turns]);

  return (
    <div className="notebook-connections-panel">
      <div className="notebook-connections-panel__head"><div><p className="drawer-section-label">Connections &amp; threads</p><span>Relationships you accept—not automatic conclusions</span></div><Badge>{accepted.length}</Badge></div>

      {threads.length ? <div className="notebook-connections-panel__threads">
        <p className="notebook-connections-panel__label"><GitBranch size={13} />Emerging threads</p>
        {threads.map((thread) => {
          const threadConnections = accepted.filter((connection) => thread.connectionIds.includes(connection.id));
          return <details key={thread.id}><summary><span><strong>{thread.label}</strong><small>{thread.turnIds.length} entries · {thread.connectionIds.length} {thread.connectionIds.length === 1 ? "connection" : "connections"}</small></span><ArrowRight size={13} /></summary><div>{threadConnections.map((connection) => {
            const source = turnMap.get(connection.sourceTurnId);
            const target = turnMap.get(connection.targetTurnId);
            if (!source || !target) return null;
            return <article key={connection.id}><Badge>{strategyConnectionLabels[connection.relationship]}</Badge><button type="button" onClick={() => scrollToTurn(source.id)}>{turnExcerpt(source)}</button><span><Link2 size={11} /></span><button type="button" onClick={() => scrollToTurn(target.id)}>{turnExcerpt(target)}</button>{connection.rationale ? <p>{connection.rationale}</p> : null}<button className="notebook-connections-panel__remove" type="button" disabled={busyKey === connection.id} onClick={() => void onRemoveConnection(connection)}>{busyKey === connection.id ? <LoaderCircle className="spin" size={11} /> : <X size={11} />}Remove</button></article>;
          })}</div></details>;
        })}
      </div> : null}

      {suggestions.length ? <div className="notebook-connections-panel__suggestions">
        <p className="notebook-connections-panel__label"><Lightbulb size={13} />Possible connections</p>
        <span className="notebook-connections-panel__explain">Sift only checks repeated words and directional language. Review each suggestion yourself.</span>
        {suggestions.map((suggestion) => {
          const source = turnMap.get(suggestion.sourceTurnId);
          const target = turnMap.get(suggestion.targetTurnId);
          if (!source || !target) return null;
          return <article key={suggestion.key}><div><Badge>{suggestion.relationship === "contradicts" ? "Possible contradiction" : "Shared language"}</Badge><small>{suggestion.factors.join(" · ")}</small></div><button type="button" onClick={() => scrollToTurn(source.id)}>{turnExcerpt(source)}</button><span><Link2 size={11} /></span><button type="button" onClick={() => scrollToTurn(target.id)}>{turnExcerpt(target)}</button><p>{suggestion.rationale}</p><footer><button type="button" disabled={busyKey === suggestion.key} onClick={() => void onDismissSuggestion(suggestion)}>{busyKey === suggestion.key ? <LoaderCircle className="spin" size={11} /> : <X size={11} />}Not useful</button><Button size="sm" variant="dark" disabled={busyKey === suggestion.key} onClick={() => void onAcceptSuggestion(suggestion)}>{busyKey === suggestion.key ? <LoaderCircle className="spin" size={12} /> : <Check size={12} />}Connect</Button></footer></article>;
        })}
      </div> : null}

      {!threads.length && !suggestions.length ? <div className="notebook-connections-panel__empty"><Link2 size={17} /><div><strong>Connections can emerge gradually.</strong><span>Use Connect on any thought. Sift may also show a transparent word-match suggestion when there is enough overlap.</span></div></div> : null}
    </div>
  );
}
