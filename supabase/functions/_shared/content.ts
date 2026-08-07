export function stripMarkup(value: string) {
  return decodeEntities(value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

export function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (named[normalized]) return named[normalized];
    if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    return match;
  });
}

export function firstTag(block: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
    if (match?.[1]) return stripMarkup(match[1]);
  }
  return "";
}

export function firstMeta(html: string, names: string[]) {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const forward = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"));
    const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"));
    const value = forward?.[1] || reverse?.[1];
    if (value) return decodeEntities(value.trim());
  }
  return "";
}

export function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function validDate(value: string, fallback: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function matchesMonitor(content: string, builder: { includeAll: string[]; includeAny: string[]; exclude: string[] }) {
  const normalized = content.toLowerCase();
  const includes = (term: string) => normalized.includes(term.trim().toLowerCase());
  return builder.includeAll.filter(Boolean).every(includes)
    && (!builder.includeAny.filter(Boolean).length || builder.includeAny.filter(Boolean).some(includes))
    && !builder.exclude.filter(Boolean).some(includes);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
