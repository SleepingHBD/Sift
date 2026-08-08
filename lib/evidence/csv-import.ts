import { normalizeEvidenceTags } from "./organization.ts";

export const csvEvidenceFields = [
  "title",
  "url",
  "author",
  "publication",
  "publishedAt",
  "itemType",
  "sourceText",
  "notes",
  "keyFindings",
  "collection",
  "tags",
] as const;

export type CsvEvidenceField = typeof csvEvidenceFields[number];
export type CsvFieldMapping = Record<CsvEvidenceField, string>;
export type CsvSourceRow = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: CsvSourceRow[];
}

export interface CsvEvidenceRow {
  rowNumber: number;
  title: string;
  url: string | null;
  author: string | null;
  publication: string | null;
  publishedAt: string | null;
  itemType: string;
  sourceText: string | null;
  notes: string | null;
  keyFindings: string | null;
  collection: string;
  tags: string[];
  identityKey: string;
  errors: string[];
  duplicateRowNumber: number | null;
}

export interface CsvValidationSummary {
  rows: CsvEvidenceRow[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

const aliases: Record<CsvEvidenceField, string[]> = {
  title: ["title", "headline", "name", "source title", "article title", "post title"],
  url: ["url", "link", "source url", "original url", "permalink"],
  author: ["author", "writer", "account", "username", "creator"],
  publication: ["publication", "publisher", "source", "website", "platform", "channel"],
  publishedAt: ["published at", "published date", "publication date", "date", "observed at", "observed date"],
  itemType: ["item type", "type", "content type", "source type"],
  sourceText: ["source text", "content", "excerpt", "quote", "caption", "body", "post text"],
  notes: ["notes", "note", "annotation", "strategist notes", "comments"],
  keyFindings: ["key findings", "key finding", "why it matters", "summary", "insight"],
  collection: ["collection", "folder", "board", "group"],
  tags: ["tags", "tag", "labels", "keywords", "topics"],
};

function cleanHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function cleanCell(value: string, maxLength = 20_000) {
  return value.trim().split("\u0000").join("").slice(0, maxLength);
}

function emptyMapping(): CsvFieldMapping {
  return Object.fromEntries(csvEvidenceFields.map((field) => [field, ""])) as CsvFieldMapping;
}

export function parseCsv(input: string, maxRows = 500): ParsedCsv {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      matrix.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }

  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    matrix.push(row);
  }

  const nonEmpty = matrix.filter((values) => values.some((value) => value.trim()));
  if (nonEmpty.length < 2) throw new Error("The CSV needs a header row and at least one evidence row.");
  const headers = nonEmpty[0].map(cleanHeader);
  if (headers.some((header) => !header)) throw new Error("Every CSV column needs a header.");
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) throw new Error("CSV headers must be unique.");
  const dataRows = nonEmpty.slice(1);
  if (dataRows.length > maxRows) throw new Error(`This importer accepts up to ${maxRows} rows at a time.`);

  return {
    headers,
    rows: dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}

export function suggestCsvMapping(headers: string[]): CsvFieldMapping {
  const mapping = emptyMapping();
  const available = new Map(headers.map((header) => [cleanHeader(header).toLocaleLowerCase(), header]));
  const used = new Set<string>();
  for (const field of csvEvidenceFields) {
    const matched = aliases[field].map((alias) => available.get(alias)).find((header) => header && !used.has(header));
    if (matched) {
      mapping[field] = matched;
      used.add(matched);
    }
  }
  return mapping;
}

function mappedValue(row: CsvSourceRow, mapping: CsvFieldMapping, field: CsvEvidenceField, maxLength?: number) {
  const header = mapping[field];
  return header ? cleanCell(row[header] ?? "", maxLength) : "";
}

function normalizeUrl(value: string) {
  if (!value) return { value: null, error: "" };
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    parsed.hash = "";
    return { value: parsed.toString(), error: "" };
  } catch {
    return { value: null, error: "URL must be a valid http or https address." };
  }
}

function normalizeDate(value: string) {
  if (!value) return { value: null, error: "" };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dayFirst ? [dayFirst[3], dayFirst[2].padStart(2, "0"), dayFirst[1].padStart(2, "0")] : null;
  if (!parts) return { value: null, error: "Date must use YYYY-MM-DD or DD/MM/YYYY." };
  const normalized = `${parts[0]}-${parts[1]}-${parts[2]}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return { value: null, error: "Date is not valid." };
  return { value: normalized, error: "" };
}

export function evidenceIdentityKey(input: Pick<CsvEvidenceRow, "title" | "url" | "sourceText">) {
  return [input.title, input.url ?? "", input.sourceText ?? ""]
    .map((value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase())
    .join("|");
}

export function mapCsvEvidenceRows(parsed: ParsedCsv, mapping: CsvFieldMapping): CsvValidationSummary {
  const seen = new Map<string, number>();
  const rows = parsed.rows.map((sourceRow, index): CsvEvidenceRow => {
    const errors: string[] = [];
    const title = mappedValue(sourceRow, mapping, "title", 500);
    if (!title) errors.push("Title is required.");
    const url = normalizeUrl(mappedValue(sourceRow, mapping, "url", 2_000));
    if (url.error) errors.push(url.error);
    const publishedAt = normalizeDate(mappedValue(sourceRow, mapping, "publishedAt", 40));
    if (publishedAt.error) errors.push(publishedAt.error);
    const draft: CsvEvidenceRow = {
      rowNumber: index + 2,
      title,
      url: url.value,
      author: mappedValue(sourceRow, mapping, "author", 300) || null,
      publication: mappedValue(sourceRow, mapping, "publication", 300) || null,
      publishedAt: publishedAt.value,
      itemType: mappedValue(sourceRow, mapping, "itemType", 80) || "Imported source",
      sourceText: mappedValue(sourceRow, mapping, "sourceText", 20_000) || null,
      notes: mappedValue(sourceRow, mapping, "notes", 10_000) || null,
      keyFindings: mappedValue(sourceRow, mapping, "keyFindings", 10_000) || null,
      collection: mappedValue(sourceRow, mapping, "collection", 120) || "CSV imports",
      tags: normalizeEvidenceTags(mappedValue(sourceRow, mapping, "tags", 1_000).split(/[;,|]/)),
      identityKey: "",
      errors,
      duplicateRowNumber: null,
    };
    draft.identityKey = evidenceIdentityKey(draft);
    if (title) {
      const duplicate = seen.get(draft.identityKey) ?? null;
      draft.duplicateRowNumber = duplicate;
      if (duplicate === null) seen.set(draft.identityKey, draft.rowNumber);
    }
    return draft;
  });

  return {
    rows,
    validCount: rows.filter((row) => row.errors.length === 0).length,
    invalidCount: rows.filter((row) => row.errors.length > 0).length,
    duplicateCount: rows.filter((row) => row.duplicateRowNumber !== null).length,
  };
}

export const csvEvidenceFieldLabels: Record<CsvEvidenceField, string> = {
  title: "Title *",
  url: "Original URL",
  author: "Author / account",
  publication: "Publication / platform",
  publishedAt: "Published / observed date",
  itemType: "Evidence type",
  sourceText: "Original source text",
  notes: "Strategist notes",
  keyFindings: "Why it matters / key finding",
  collection: "Collection",
  tags: "Tags",
};
