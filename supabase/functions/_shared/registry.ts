import { collectManualUrls } from "./manual.ts";
import { collectRssFeeds } from "./rss.ts";
import type { ConnectorCursor, ConnectorSource, MonitorInput, NormalizedMention, RunRequest, SourceRunResult } from "./types.ts";
import { collectYouTube } from "./youtube.ts";

export interface RuntimeConnector {
  readonly source: ConnectorSource;
  collect(signal: AbortSignal, cursor?: ConnectorCursor): Promise<{ mentions: NormalizedMention[]; result: SourceRunResult; cursor?: ConnectorCursor }>;
}

export function createConnectorRegistry(input: RunRequest, secrets: { youtubeApiKey: string }) {
  const connectors: RuntimeConnector[] = [
    createRssConnector(input.monitor, input.connectorConfig.rssFeedUrls),
    createManualConnector(input.monitor, input.connectorConfig.manualUrls),
    createYouTubeConnector(input.monitor, input.connectorConfig.youtubeEnabled, secrets.youtubeApiKey),
  ];
  return new Map(connectors.map((connector) => [connector.source, connector]));
}

function createRssConnector(monitor: MonitorInput, urls: string[]): RuntimeConnector {
  return {
    source: "rss",
    async collect(signal, cursor) {
      if (!urls.length) throw new Error("Add at least one RSS or Atom feed URL.");
      const collected = await collectRssFeeds(urls, monitor, signal, cursor);
      if (collected.failures.length && !collected.mentions.length) throw new Error(collected.failures[0]);
      return {
        mentions: collected.mentions,
        result: {
          source: "rss",
          status: collected.failures.length && !collected.mentions.length ? "failed" : "completed",
          count: collected.mentions.length,
          message: collected.failures.length ? `${collected.failures.length} feed${collected.failures.length === 1 ? "" : "s"} could not be retrieved.` : undefined,
          collectionMode: cursor ? "incremental" : "snapshot",
        },
        cursor: collected.cursor,
      };
    },
  };
}

function createManualConnector(monitor: MonitorInput, urls: string[]): RuntimeConnector {
  return {
    source: "manual",
    async collect(signal) {
      if (!urls.length) throw new Error("Add at least one public URL.");
      const collected = await collectManualUrls(urls, monitor, signal);
      if (collected.failures.length && !collected.mentions.length) throw new Error(collected.failures[0]);
      return {
        mentions: collected.mentions,
        result: {
          source: "manual",
          status: collected.failures.length && !collected.mentions.length ? "failed" : "completed",
          count: collected.mentions.length,
          message: collected.failures.length ? `${collected.failures.length} URL${collected.failures.length === 1 ? "" : "s"} could not be imported.` : undefined,
          collectionMode: "snapshot",
        },
      };
    },
  };
}

function createYouTubeConnector(monitor: MonitorInput, enabled: boolean, apiKey: string): RuntimeConnector {
  return {
    source: "youtube",
    async collect(signal, cursor) {
      if (!enabled) throw new Error("YouTube is not enabled in source settings.");
      const collected = await collectYouTube(monitor, apiKey, signal, cursor);
      return {
        mentions: collected.mentions,
        result: { source: "youtube", status: "completed", count: collected.mentions.length, collectionMode: cursor ? "incremental" : "snapshot" },
        cursor: collected.cursor,
      };
    },
  };
}
