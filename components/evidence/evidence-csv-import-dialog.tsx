"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileSpreadsheet,
  History,
  LoaderCircle,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  csvEvidenceFieldLabels,
  csvEvidenceFields,
  mapCsvEvidenceRows,
  parseCsv,
  suggestCsvMapping,
  type CsvFieldMapping,
  type ParsedCsv,
} from "@/lib/evidence/csv-import";
import {
  importEvidenceCsv,
  listEvidenceImportHistory,
  previewEvidenceCsvDuplicates,
  type EvidenceCloudDuplicate,
  type EvidenceImportDuplicatePolicy,
  type EvidenceImportHistoryEntry,
  type EvidenceImportResult,
} from "@/lib/evidence/csv-import-repository";
import type { Project } from "@/lib/types";

const maximumCsvBytes = 5 * 1024 * 1024;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function fileIsCsv(file: File) {
  return file.name.toLocaleLowerCase().endsWith(".csv") || ["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.type);
}

function importHistoryLabel(entry: EvidenceImportHistoryEntry) {
  if (entry.rejectedRows) return "Needs attention";
  if (entry.duplicateRows) return "Completed with skips";
  return "Completed";
}

export function EvidenceCsvImportDialog({
  projects,
  initialProjectId,
  onClose,
  onImported,
}: {
  projects: Project[];
  initialProjectId?: string;
  onClose: () => void;
  onImported: (result: EvidenceImportResult) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const initialProject = projects.find((project) => project.id === initialProjectId) ?? projects[0];
  const [projectId, setProjectId] = useState(initialProject?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvFieldMapping | null>(null);
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [duplicatePolicy, setDuplicatePolicy] = useState<EvidenceImportDuplicatePolicy>("skip");
  const [fileError, setFileError] = useState("");
  const [cloudDuplicates, setCloudDuplicates] = useState<EvidenceCloudDuplicate[]>([]);
  const [duplicateStatus, setDuplicateStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [duplicateError, setDuplicateError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<EvidenceImportResult | null>(null);
  const [history, setHistory] = useState<EvidenceImportHistoryEntry[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [historyError, setHistoryError] = useState("");
  const project = projects.find((candidate) => candidate.id === projectId) ?? null;
  const validation = useMemo(() => parsed && mapping ? mapCsvEvidenceRows(parsed, mapping) : null, [mapping, parsed]);
  const cloudDuplicateRows = useMemo(() => new Map(cloudDuplicates.map((duplicate) => [duplicate.rowNumber, duplicate])), [cloudDuplicates]);
  const totalDuplicateRows = validation?.rows.filter((row) => row.duplicateRowNumber !== null || cloudDuplicateRows.has(row.rowNumber)).length ?? 0;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setHistoryStatus("loading");
      setHistoryError("");
      void listEvidenceImportHistory(project?.cloudId ?? null).then((entries) => {
        if (!active) return;
        setHistory(entries);
        setHistoryStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setHistoryStatus("error");
        setHistoryError(error instanceof Error ? error.message : "Import history could not be loaded.");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [project?.cloudId]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!project?.cloudId || !validation?.validCount) {
        setCloudDuplicates([]);
        setDuplicateStatus("idle");
        return;
      }
      setDuplicateStatus("loading");
      setDuplicateError("");
      const candidates = validation.rows.filter((row) => !row.errors.length);
      void previewEvidenceCsvDuplicates(project.cloudId!, candidates).then((duplicates) => {
        if (!active) return;
        setCloudDuplicates(duplicates);
        setDuplicateStatus("ready");
      }).catch((error: unknown) => {
        if (!active) return;
        setCloudDuplicates([]);
        setDuplicateStatus("error");
        setDuplicateError(error instanceof Error ? error.message : "Existing evidence could not be compared.");
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [project?.cloudId, validation]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    setFileError("");
    setImportError("");
    setResult(null);
    if (!fileIsCsv(selected)) {
      setFileError("Choose a .csv file.");
      event.target.value = "";
      return;
    }
    if (selected.size > maximumCsvBytes) {
      setFileError("CSV files must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    try {
      const nextParsed = parseCsv(await selected.text());
      setFile(selected);
      setParsed(nextParsed);
      setMapping(suggestCsvMapping(nextParsed.headers));
      setClientRef(crypto.randomUUID());
      setCloudDuplicates([]);
      setDuplicateStatus("idle");
    } catch (error) {
      setFile(null);
      setParsed(null);
      setMapping(null);
      setFileError(error instanceof Error ? error.message : "This CSV could not be read.");
      event.target.value = "";
    }
  }

  function resetFile() {
    setFile(null);
    setParsed(null);
    setMapping(null);
    setResult(null);
    setFileError("");
    setImportError("");
    setCloudDuplicates([]);
    setClientRef(crypto.randomUUID());
    if (fileInput.current) fileInput.current.value = "";
  }

  async function runImport() {
    if (!file || !mapping || !validation || !project?.cloudId || importing || !validation.validCount) return;
    setImporting(true);
    setImportError("");
    try {
      const nextResult = await importEvidenceCsv({
        projectId: project.cloudId,
        clientRef,
        filename: file.name,
        mapping,
        duplicatePolicy,
        rows: validation.rows,
      });
      setResult(nextResult);
      setHistory((current) => [{ ...nextResult.run, rows: nextResult.rows }, ...current.filter((entry) => entry.id !== nextResult.run.id)].slice(0, 12));
      onImported(nextResult);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Evidence could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="radar-overlay" role="dialog" aria-modal="true" aria-labelledby="csv-import-title">
      <button className="radar-overlay__scrim" onClick={onClose} aria-label="Close CSV import" />
      <section className="workspace-dialog evidence-csv-dialog">
        <header>
          <div><span className="workspace-dialog__icon"><FileSpreadsheet size={19} /></span><div><p className="eyebrow">Evidence import</p><h2 id="csv-import-title">Bring a research spreadsheet into Sift.</h2></div></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="workspace-dialog__body evidence-csv-dialog__body">
          {result ? (
            <section className="evidence-csv-result" aria-live="polite">
              <span className="evidence-csv-result__icon"><Check size={24} /></span>
              <div><p className="eyebrow">Import complete</p><h3>{result.run.acceptedRows} {result.run.acceptedRows === 1 ? "source" : "sources"} added to Research.</h3><p>{result.run.duplicateRows ? `${result.run.duplicateRows} duplicate ${result.run.duplicateRows === 1 ? "was" : "were"} skipped. ` : ""}{result.run.rejectedRows ? `${result.run.rejectedRows} invalid ${result.run.rejectedRows === 1 ? "row needs" : "rows need"} correction.` : "Every mapped row passed server validation."}</p>{result.retried ? <Badge>Safe retry · no duplicate write</Badge> : null}</div>
              {result.rows.some((row) => row.status === "rejected") ? <details><summary>Rows that need correction</summary><ul>{result.rows.filter((row) => row.status === "rejected").map((row) => <li key={row.id}><strong>Row {row.rowNumber}</strong><span>{row.errorMessages.join(" ")}</span></li>)}</ul></details> : null}
              <div className="evidence-csv-result__actions"><Button onClick={resetFile}><RotateCcw size={14} />Import another file</Button><Button variant="dark" onClick={onClose}>Return to evidence</Button></div>
            </section>
          ) : (
            <>
              <div className="evidence-csv-intro">
                <label><span>Destination project *</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Imported rows become normal Research evidence inside this project.</small></label>
                <div className="evidence-csv-file">
                  <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event)} />
                  <Upload size={20} /><div><strong>{file?.name ?? "Choose a CSV file"}</strong><span>{file ? `${validation?.rows.length ?? 0} data rows · raw file stays on this device` : "Up to 500 rows or 5 MB · the first row must contain headers"}</span></div>
                  <Button type="button" onClick={() => fileInput.current?.click()}>{file ? "Replace" : "Choose file"}</Button>
                </div>
                {fileError ? <p className="form-error" role="alert">{fileError}</p> : null}
              </div>

              {parsed && mapping && validation ? (
                <div className="evidence-csv-workspace">
                  <section className="evidence-csv-mapping">
                    <div className="evidence-csv-section-heading"><div><p className="eyebrow">1 · Map fields</p><h3>Tell Sift what each column means.</h3></div><span>Only Title is required</span></div>
                    <div className="evidence-csv-mapping-grid">
                      {csvEvidenceFields.map((field) => <label key={field}><span>{csvEvidenceFieldLabels[field]}</span><select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">Do not import</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
                    </div>
                  </section>

                  <section className="evidence-csv-preview">
                    <div className="evidence-csv-section-heading"><div><p className="eyebrow">2 · Review</p><h3>Check the mapped evidence before saving.</h3></div>{duplicateStatus === "loading" ? <span><LoaderCircle className="spin" size={13} />Checking existing evidence…</span> : null}</div>
                    <div className="evidence-csv-summary">
                      <div><strong>{validation.rows.length}</strong><span>Total rows</span></div>
                      <div><strong>{validation.validCount}</strong><span>Valid</span></div>
                      <div className={validation.invalidCount ? "has-warning" : ""}><strong>{validation.invalidCount}</strong><span>Invalid</span></div>
                      <div className={totalDuplicateRows ? "has-warning" : ""}><strong>{totalDuplicateRows}</strong><span>Possible duplicates</span></div>
                    </div>
                    {duplicateStatus === "error" ? <div className="evidence-csv-inline-warning"><AlertTriangle size={15} /><span>{duplicateError} The server will still check again before writing.</span></div> : null}
                    {!mapping.title ? <div className="evidence-csv-inline-warning"><AlertTriangle size={15} /><span>Map a CSV column to Title before importing.</span></div> : null}
                    <div className="evidence-csv-table-wrap"><table><thead><tr><th>Row</th><th>Title</th><th>Source</th><th>Original text</th><th>Tags</th><th>Check</th></tr></thead><tbody>{validation.rows.slice(0, 8).map((row) => {
                      const cloudDuplicate = cloudDuplicateRows.get(row.rowNumber);
                      return <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.title || <em>Missing title</em>}</td><td>{row.publication ?? row.url ?? "—"}</td><td>{row.sourceText?.slice(0, 90) ?? "—"}</td><td>{row.tags.join(", ") || "—"}</td><td>{row.errors.length ? <span className="evidence-csv-status evidence-csv-status--error">{row.errors.join(" ")}</span> : row.duplicateRowNumber ? <span className="evidence-csv-status evidence-csv-status--duplicate">Same as row {row.duplicateRowNumber}</span> : cloudDuplicate ? <span className="evidence-csv-status evidence-csv-status--duplicate">Already in project</span> : <span className="evidence-csv-status evidence-csv-status--valid"><Check size={12} />Valid</span>}</td></tr>;
                    })}</tbody></table></div>
                    {validation.rows.length > 8 ? <small className="evidence-csv-preview__more">Showing 8 of {validation.rows.length} rows. Every row will be validated again by Supabase.</small> : null}
                  </section>

                  <section className="evidence-csv-duplicates">
                    <div><p className="eyebrow">3 · Handle duplicates</p><h3>Choose what Sift should do with matches.</h3></div>
                    <label className={duplicatePolicy === "skip" ? "active" : ""}><input aria-label="Skip matching evidence" type="radio" name="duplicate-policy" checked={duplicatePolicy === "skip"} onChange={() => setDuplicatePolicy("skip")} /><span>Skip matching evidence<small>Recommended. Matches are recorded in history but not copied.</small></span></label>
                    <label className={duplicatePolicy === "import" ? "active" : ""}><input aria-label="Import valid duplicate rows anyway" type="radio" name="duplicate-policy" checked={duplicatePolicy === "import"} onChange={() => setDuplicatePolicy("import")} /><span>Import valid rows anyway<small>Use when repeated URLs or text represent intentionally separate observations.</small></span></label>
                  </section>

                  {importError ? <p className="form-error" role="alert">{importError}</p> : null}
                </div>
              ) : null}
            </>
          )}

          <section className="evidence-import-history">
            <div className="evidence-csv-section-heading"><div><p className="eyebrow"><History size={12} />Import history</p><h3>Recent CSV activity</h3></div><span>Private to your workspace</span></div>
            {historyStatus === "loading" ? <div className="evidence-import-history__state"><LoaderCircle className="spin" size={16} />Loading history…</div> : historyStatus === "error" ? <div className="evidence-csv-inline-warning"><AlertTriangle size={15} /><span>{historyError}</span></div> : history.length ? <div className="evidence-import-history__list">{history.map((entry) => <details key={entry.id}><summary><span><FileSpreadsheet size={15} /><span><strong>{entry.filename}</strong><small>{formatDate(entry.createdAt)}</small></span></span><span><Badge>{importHistoryLabel(entry)}</Badge><strong>{entry.acceptedRows} added</strong><ChevronRight size={14} /></span></summary><div><span>{entry.totalRows} total</span><span>{entry.duplicateRows} duplicates</span><span>{entry.rejectedRows} rejected</span>{entry.rows.filter((row) => row.status === "rejected").slice(0, 5).map((row) => <p key={row.id}>Row {row.rowNumber}: {row.errorMessages.join(" ")}</p>)}</div></details>)}</div> : <div className="evidence-import-history__state">No CSV imports yet.</div>}
          </section>
        </div>

        {!result ? <footer><Button type="button" onClick={onClose}>Cancel</Button><Button type="button" variant="dark" disabled={!file || !project?.cloudId || !mapping?.title || !validation?.validCount || importing} onClick={() => void runImport()}>{importing ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}{importing ? "Importing…" : `Import ${validation?.validCount ?? 0} valid rows`}</Button></footer> : null}
      </section>
    </div>
  );
}
