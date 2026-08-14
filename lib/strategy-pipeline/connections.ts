import type {
  StrategyConnectionRelationship,
  StrategyConnectionSuggestion,
  StrategyEmergingThread,
  StrategySessionConnectionRecord,
  StrategySessionTurnRecord,
} from "./types";

const stopWords = new Set([
  "about", "after", "again", "also", "because", "been", "before", "being", "between",
  "could", "does", "doing", "from", "have", "having", "into", "just", "more", "most",
  "other", "over", "really", "should", "some", "still", "than", "that", "their", "them",
  "then", "there", "these", "they", "this", "those", "through", "under", "very", "want",
  "what", "when", "where", "which", "while", "with", "would", "your", "source", "added",
  "page", "think", "thinking", "people", "seems", "feel", "feels", "like",
]);

const upwardCues = new Set(["increase", "increasing", "growing", "growth", "prefer", "trust", "works", "easier", "positive", "more"]);
const downwardCues = new Set(["decrease", "decreasing", "declining", "avoid", "distrust", "fails", "harder", "negative", "less", "not"]);

function tokensForTurn(turn: StrategySessionTurnRecord) {
  const sourceText = turn.sources.flatMap((source) => [
    source.source.title,
    source.excerpt ?? "",
    source.source.excerpt ?? "",
  ]).join(" ");
  const values = `${turn.content} ${sourceText}`
    .toLocaleLowerCase()
    .normalize("NFKD")
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{2,}/gu) ?? [];
  return values
    .map((value) => value.replace(/[’']/g, ""))
    .filter((value) => !stopWords.has(value));
}

function uniqueTokens(turn: StrategySessionTurnRecord) {
  return new Set(tokensForTurn(turn));
}

export function notebookConnectionPairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join(":");
}

function relationshipForPair(left: Set<string>, right: Set<string>): StrategyConnectionRelationship {
  const leftUp = [...left].some((token) => upwardCues.has(token));
  const rightUp = [...right].some((token) => upwardCues.has(token));
  const leftDown = [...left].some((token) => downwardCues.has(token));
  const rightDown = [...right].some((token) => downwardCues.has(token));
  return (leftUp && rightDown) || (rightUp && leftDown) ? "contradicts" : "related";
}

export function suggestNotebookConnections(
  turns: StrategySessionTurnRecord[],
  connections: StrategySessionConnectionRecord[],
  limit = 4,
): StrategyConnectionSuggestion[] {
  const handledPairs = new Set(connections.map((connection) => notebookConnectionPairKey(connection.sourceTurnId, connection.targetTurnId)));
  const candidates: StrategyConnectionSuggestion[] = [];

  for (let leftIndex = 0; leftIndex < turns.length; leftIndex += 1) {
    const left = turns[leftIndex];
    const leftTokens = uniqueTokens(left);
    if (leftTokens.size < 2) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < turns.length; rightIndex += 1) {
      const right = turns[rightIndex];
      const key = notebookConnectionPairKey(left.id, right.id);
      if (handledPairs.has(key)) continue;
      const rightTokens = uniqueTokens(right);
      if (rightTokens.size < 2) continue;
      const shared = [...leftTokens]
        .filter((token) => rightTokens.has(token))
        .sort((a, b) => b.length - a.length || a.localeCompare(b));
      const distinctiveSingle = shared.length === 1 && shared[0].length >= 9;
      if (shared.length < 2 && !distinctiveSingle) continue;
      const unionSize = new Set([...leftTokens, ...rightTokens]).size;
      const score = Math.round((shared.length * 18) + ((shared.length / Math.max(unionSize, 1)) * 100));
      if (score < 34) continue;
      const factors = shared.slice(0, 4);
      const relationship = relationshipForPair(leftTokens, rightTokens);
      candidates.push({
        key,
        sourceTurnId: left.id,
        targetTurnId: right.id,
        relationship,
        rationale: relationship === "contradicts"
          ? `These entries share ${factors.join(", ")} while using language that may point in different directions.`
          : `These entries repeat ${factors.join(", ")}.`,
        factors,
        score,
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
    .slice(0, Math.max(0, limit));
}

function threadLabel(turns: StrategySessionTurnRecord[]) {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    for (const token of new Set(tokensForTurn(turn))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const recurring = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([token]) => token);
  if (!recurring.length) return "Connected thinking";
  return recurring.map((token) => `${token.charAt(0).toLocaleUpperCase()}${token.slice(1)}`).join(" · ");
}

export function buildEmergingThreads(
  turns: StrategySessionTurnRecord[],
  connections: StrategySessionConnectionRecord[],
): StrategyEmergingThread[] {
  const accepted = connections.filter((connection) => connection.status === "accepted");
  const adjacency = new Map<string, Set<string>>();
  for (const connection of accepted) {
    adjacency.set(connection.sourceTurnId, new Set([...(adjacency.get(connection.sourceTurnId) ?? []), connection.targetTurnId]));
    adjacency.set(connection.targetTurnId, new Set([...(adjacency.get(connection.targetTurnId) ?? []), connection.sourceTurnId]));
  }
  const turnMap = new Map(turns.map((turn) => [turn.id, turn]));
  const visited = new Set<string>();
  const threads: StrategyEmergingThread[] = [];

  for (const turnId of adjacency.keys()) {
    if (visited.has(turnId)) continue;
    const queue = [turnId];
    const component: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) queue.push(neighbour);
      }
    }
    const componentSet = new Set(component);
    const componentTurns = component.map((id) => turnMap.get(id)).filter((turn): turn is StrategySessionTurnRecord => Boolean(turn));
    const componentConnections = accepted.filter((connection) => componentSet.has(connection.sourceTurnId) && componentSet.has(connection.targetTurnId));
    if (componentTurns.length < 2 || !componentConnections.length) continue;
    threads.push({
      id: component.slice().sort().join(":"),
      label: threadLabel(componentTurns),
      turnIds: componentTurns.map((turn) => turn.id),
      connectionIds: componentConnections.map((connection) => connection.id),
      latestAt: componentTurns.reduce((latest, turn) => turn.createdAt > latest ? turn.createdAt : latest, componentTurns[0].createdAt),
    });
  }

  return threads.sort((left, right) => right.latestAt.localeCompare(left.latestAt));
}

export const strategyConnectionLabels: Record<StrategyConnectionRelationship, string> = {
  related: "Related",
  reinforces: "Reinforces",
  contradicts: "Contradicts",
  opens_question: "Opens a question",
};
