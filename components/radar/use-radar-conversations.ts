"use client";

import { useCallback, useEffect, useState } from "react";
import { getCloudRadarConversationPage, type RadarConversationPageRequest } from "@/lib/radar/repository";
import type { RadarMention } from "@/lib/radar/types";

type ConversationStatus = "idle" | "loading" | "ready" | "error";

export function useRadarConversations(
  request: RadarConversationPageRequest | null,
  refreshKey: string,
  onMentionsLoaded: (mentions: RadarMention[]) => void | Promise<void>,
) {
  const [mentions, setMentions] = useState<RadarMention[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setMentions([]);
      setTotal(0);
      setNextCursor(null);
      setError("");
      if (!request?.monitor.cloudId) {
        setStatus("idle");
        return;
      }
      setStatus("loading");
      try {
        const page = await getCloudRadarConversationPage({ ...request, cursor: null });
        if (cancelled) return;
        setMentions(page.mentions);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
        setStatus("ready");
        void onMentionsLoaded(page.mentions);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Complete conversation history could not be loaded.");
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [onMentionsLoaded, refreshKey, request]);

  const loadMore = useCallback(async () => {
    if (!request?.monitor.cloudId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await getCloudRadarConversationPage({ ...request, cursor: nextCursor });
      setMentions((current) => {
        const merged = new Map(current.map((mention) => [mention.id, mention]));
        page.mentions.forEach((mention) => merged.set(mention.id, mention));
        return [...merged.values()];
      });
      setTotal((current) => page.total || current);
      setNextCursor(page.nextCursor);
      void onMentionsLoaded(page.mentions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More conversations could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, onMentionsLoaded, request]);

  return { mentions, total, hasMore: Boolean(nextCursor), status, loadingMore, error, loadMore };
}
