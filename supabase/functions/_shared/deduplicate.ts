import type { ConnectorSource, NormalizedMention } from "./types.ts";

export interface MentionDeduplicationResult {
  mentions: NormalizedMention[];
  duplicatesRemoved: number;
  duplicatesBySource: Partial<Record<ConnectorSource, number>>;
}

export function deduplicateMentions(mentions: NormalizedMention[]): MentionDeduplicationResult {
  const unique = new Map<string, NormalizedMention>();
  const duplicatesBySource: Partial<Record<ConnectorSource, number>> = {};

  for (const mention of mentions) {
    const key = `${mention.platform}:${mention.externalId}`;
    if (unique.has(key)) duplicatesBySource[mention.platform] = (duplicatesBySource[mention.platform] ?? 0) + 1;
    unique.set(key, mention);
  }

  return {
    mentions: [...unique.values()],
    duplicatesRemoved: mentions.length - unique.size,
    duplicatesBySource,
  };
}
