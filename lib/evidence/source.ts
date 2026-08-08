export interface NormalizedSource {
  url: string | null;
  label: string | null;
}

export function normalizeSource(value: string): NormalizedSource {
  const source = value.trim();
  if (!source) return { url: null, label: null };

  try {
    const url = new URL(source);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { url: null, label: source };
    }
    return { url: url.toString(), label: url.hostname.replace(/^www\./, "") };
  } catch {
    return { url: null, label: source };
  }
}

export function stringArrayFromMetadata(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function stringFromMetadata(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}
