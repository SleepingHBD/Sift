import type { QueryBuilderState } from "./types";

function cleanTerm(term: string) {
  return term.trim().replace(/^['"]|['"]$/g, "").trim();
}

function formatTerm(term: string) {
  const cleaned = cleanTerm(term);
  if (!cleaned) return "";
  return /\s/.test(cleaned) ? `"${cleaned.replaceAll('"', "")}"` : cleaned;
}

export function splitTerms(value: string) {
  return value.split(/[\n,]/).map(cleanTerm).filter(Boolean);
}

export function buildBooleanQuery(builder: QueryBuilderState) {
  const all = builder.includeAll.map(formatTerm).filter(Boolean);
  const any = builder.includeAny.map(formatTerm).filter(Boolean);
  const excluded = builder.exclude.map(formatTerm).filter(Boolean);
  const sections: string[] = [];
  if (all.length) sections.push(all.join(" AND "));
  if (any.length) sections.push(`(${any.join(" OR ")})`);
  if (excluded.length) sections.push(excluded.map((term) => `NOT ${term}`).join(" AND "));
  return sections.join(" AND ");
}

export interface MonitoringIntentInterpretation {
  name: string;
  subject: string;
  market: string;
  builder: QueryBuilderState;
  query: string;
}

function splitNaturalList(value: string) {
  return value
    .split(/\s*(?:,|\band\b|\bor\b)\s*/i)
    .map((term) => cleanTerm(term.replace(/[.!?]+$/g, "")))
    .filter(Boolean);
}

/**
 * Turns a lightweight plain-language monitoring request into a transparent
 * Boolean starting point. This is intentionally deterministic: users can
 * inspect and refine every interpreted field in Advanced options.
 */
export function interpretMonitoringIntent(value: string): MonitoringIntentInterpretation {
  const normalized = value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
  if (!normalized) {
    const builder = { includeAll: [], includeAny: [], exclude: [] };
    return { name: "", subject: "", market: "", builder, query: "" };
  }

  let working = normalized;
  let excluded: string[] = [];
  const exclusionMatch = working.match(/(?:,?\s+)(?:excluding|exclude|without|but\s+not)\s+(.+)$/i);
  if (exclusionMatch) {
    excluded = splitNaturalList(exclusionMatch[1]);
    working = working.slice(0, exclusionMatch.index).trim().replace(/,+$/g, "");
  }

  working = working.replace(/^(?:track|monitor|follow|listen\s+for|conversations?\s+about|mentions?\s+of|people\s+talking\s+about)\s+/i, "").trim();

  let subject = working;
  let market = "";
  const locationMatch = working.match(/\s+(?:in|across|within)\s+([^,;]+)$/i);
  if (locationMatch) {
    const candidate = cleanTerm(locationMatch[1]);
    if (candidate && candidate.split(/\s+/).length <= 4) {
      market = candidate;
      subject = working.slice(0, locationMatch.index).trim();
    }
  }

  subject = cleanTerm(subject) || cleanTerm(working);
  const includeAll = [subject, market].filter(Boolean);
  const builder = { includeAll, includeAny: [], exclude: excluded };
  const baseName = subject.length > 48 ? `${subject.slice(0, 45).trim()}…` : subject;
  const name = `${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}${market ? ` — ${market}` : ""}`;
  return { name, subject, market, builder, query: buildBooleanQuery(builder) };
}

export function validateBooleanQuery(query: string) {
  const errors: string[] = [];
  let depth = 0;
  let inQuote = false;
  for (const character of query) {
    if (character === '"') inQuote = !inQuote;
    if (!inQuote && character === "(") depth += 1;
    if (!inQuote && character === ")") depth -= 1;
    if (depth < 0) errors.push("A closing parenthesis appears before its opening parenthesis.");
  }
  if (inQuote) errors.push("An exact phrase is missing a closing quotation mark.");
  if (depth !== 0) errors.push("Parentheses are not balanced.");
  if (/\b(AND|OR)\s+(AND|OR)\b|\bNOT\s+NOT\b/i.test(query)) errors.push("Two incompatible Boolean operators appear next to each other.");
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

type QueryToken = { kind: "term"; value: string } | { kind: "operator"; value: "AND" | "OR" | "NOT" } | { kind: "open" | "close" };

function tokenize(query: string): QueryToken[] {
  const raw = query.match(/"[^"]*"|\(|\)|\bAND\b|\bOR\b|\bNOT\b|[^\s()]+/gi) ?? [];
  const tokens: QueryToken[] = raw.map((value) => {
    const upper = value.toUpperCase();
    if (upper === "AND" || upper === "OR" || upper === "NOT") return { kind: "operator", value: upper };
    if (value === "(") return { kind: "open" };
    if (value === ")") return { kind: "close" };
    return { kind: "term", value: value.replace(/^"|"$/g, "").toLowerCase() };
  });

  const withImplicitAnd: QueryToken[] = [];
  tokens.forEach((token) => {
    const previous = withImplicitAnd.at(-1);
    const previousCompletesExpression = previous?.kind === "term" || previous?.kind === "close";
    const tokenStartsExpression = token.kind === "term" || token.kind === "open" || (token.kind === "operator" && token.value === "NOT");
    if (previousCompletesExpression && tokenStartsExpression) withImplicitAnd.push({ kind: "operator", value: "AND" });
    withImplicitAnd.push(token);
  });
  return withImplicitAnd;
}

/** Evaluates the supported Boolean subset against normalized mention text. */
export function matchesBooleanQuery(content: string, query: string) {
  if (!query.trim()) return true;
  const precedence = { OR: 1, AND: 2, NOT: 3 } as const;
  const output: QueryToken[] = [];
  const operators: QueryToken[] = [];

  for (const token of tokenize(query)) {
    if (token.kind === "term") output.push(token);
    if (token.kind === "operator") {
      while (operators.length) {
        const top = operators.at(-1);
        if (!top || top.kind !== "operator") break;
        const shouldPop = token.value === "NOT" ? precedence[top.value] > precedence[token.value] : precedence[top.value] >= precedence[token.value];
        if (!shouldPop) break;
        output.push(operators.pop()!);
      }
      operators.push(token);
    }
    if (token.kind === "open") operators.push(token);
    if (token.kind === "close") {
      while (operators.length && operators.at(-1)?.kind !== "open") output.push(operators.pop()!);
      if (operators.at(-1)?.kind === "open") operators.pop();
    }
  }
  while (operators.length) {
    const token = operators.pop()!;
    if (token.kind === "open" || token.kind === "close") return false;
    output.push(token);
  }

  const haystack = content.toLowerCase();
  const values: boolean[] = [];
  for (const token of output) {
    if (token.kind === "term") values.push(haystack.includes(token.value));
    if (token.kind === "operator" && token.value === "NOT") {
      const value = values.pop();
      if (value === undefined) return false;
      values.push(!value);
    }
    if (token.kind === "operator" && token.value !== "NOT") {
      const right = values.pop();
      const left = values.pop();
      if (left === undefined || right === undefined) return false;
      values.push(token.value === "AND" ? left && right : left || right);
    }
  }
  return values.length === 1 && values[0];
}
