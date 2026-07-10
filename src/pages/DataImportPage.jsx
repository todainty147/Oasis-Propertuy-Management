import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Upload,
  XCircle,
} from "lucide-react";
import { useAccount } from "../context/AccountContext";
import { parseTabCsv, hashFileContent, getTemplateHeaders } from "../lib/spreadsheetParser";
import {
  processImportBatch,
  listImportBatches,
} from "../services/spreadsheetImportService";

const TABS = [
  { key: "properties", label: "Properties" },
  { key: "tenancies", label: "Tenancies" },
  { key: "compliance", label: "Compliance" },
  { key: "maintenance", label: "Maintenance" },
];

const STATUS_BADGE = {
  imported: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  skipped: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  needs_review: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
};

function Badge({ status }) {
  const cls = STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function SummaryBar({ result }) {
  if (!result) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Imported", value: result.imported, color: "text-emerald-600 dark:text-emerald-400" },
        { label: "Skipped", value: result.skipped, color: "text-slate-500 dark:text-slate-400" },
        { label: "Needs review", value: result.needs_review, color: "text-amber-600 dark:text-amber-400" },
        { label: "Error", value: result.error, color: "text-red-600 dark:text-red-400" },
      ].map(({ label, value, color }) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value ?? 0}</p>
        </div>
      ))}
    </div>
  );
}

function RowResultTable({ rows }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows?.length) return null;

  const display = expanded ? rows : rows.slice(0, 10);

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
            <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Row</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Status</th>
            <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Note</th>
          </tr>
        </thead>
        <tbody>
          {display.map((row) => (
            <tr
              key={row.row_number}
              className="border-b border-slate-100 last:border-0 dark:border-slate-800"
            >
              <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                {row.row_number}
              </td>
              <td className="px-3 py-2">
                <Badge status={row.status} />
              </td>
              <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                {row.review_reason || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  );
}

function RecentBatches({ batches }) {
  const [open, setOpen] = useState(false);
  if (!batches.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        <span>Recent imports</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60">
                {["File", "Tab", "Status", "Total", "Imported", "Needs review", "Date"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    {b.source_filename}
                  </td>
                  <td className="px-3 py-2 capitalize text-slate-600 dark:text-slate-300">{b.tab}</td>
                  <td className="px-3 py-2"><Badge status={b.status} /></td>
                  <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{b.total_rows}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-600 dark:text-emerald-400">{b.imported_rows}</td>
                  <td className="px-3 py-2 tabular-nums text-amber-600 dark:text-amber-400">{b.review_rows}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DataImportPage() {
  const { activeAccountId } = useAccount();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("properties");
  const [file, setFile] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [parseErrors, setParseErrors] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState("");
  const [batches, setBatches] = useState([]);

  useEffect(() => {
    if (!activeAccountId) return;
    listImportBatches({ accountId: activeAccountId })
      .then(setBatches)
      .catch(() => {});
  }, [activeAccountId, importResult]);

  const resetFile = useCallback(() => {
    setFile(null);
    setCsvText("");
    setParseErrors([]);
    setParsedRows([]);
    setImportResult(null);
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    resetFile();
  };

  const handleFileChange = useCallback(
    (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setImportResult(null);
      setImportError("");

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        setCsvText(text);
        const { rows, parseErrors: parsedErrors } = parseTabCsv(text, activeTab);
        setParseErrors(parsedErrors);
        setParsedRows(rows);
      };
      reader.readAsText(f);
    },
    [activeTab]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      const event = { target: { files: [f] } };
      handleFileChange(event);
      if (fileInputRef.current) {
        const dt = new DataTransfer();
        dt.items.add(f);
        fileInputRef.current.files = dt.files;
      }
    },
    [handleFileChange]
  );

  const handleImport = useCallback(async () => {
    if (!activeAccountId || !file || parsedRows.length === 0) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);

    try {
      const result = await processImportBatch({
        accountId: activeAccountId,
        tab: activeTab,
        rows: parsedRows,
        sourceFilename: file.name,
        sourceFileHash: hashFileContent(csvText),
      });
      setImportResult(result);
    } catch (err) {
      setImportError(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }, [activeAccountId, file, parsedRows, activeTab, csvText]);

  const handleDownloadTemplate = () => {
    const headers = getTemplateHeaders(activeTab);
    const blob = new Blob([headers + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-template-${activeTab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canImport =
    !importing && parsedRows.length > 0 && parseErrors.length === 0 && !importResult;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Settings / Data import</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
            Import data from spreadsheet
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Import properties, tenancies, compliance records, and maintenance history from a CSV
            file. Each row is processed individually — one bad row will not block the others.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          CSV template
        </button>
      </div>

      {/* Provenance notice */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Imported records are marked as <strong>attested import custody</strong> — the data comes
          from your spreadsheet, not from Tenaqo-observed events. Dates such as gas certificate
          issue dates are recorded as landlord-supplied and are not independently verified.
        </p>
      </div>

      {/* Tab picker */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "bg-white shadow-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* File drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
      >
        {file ? (
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <FileText className="h-4 w-4 text-slate-400" />
              {file.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {parsedRows.length} valid row{parsedRows.length !== 1 ? "s" : ""} detected
              {parseErrors.length > 0 && ` · ${parseErrors.length} skipped (validation errors)`}
            </p>
            {!importResult && (
              <button
                type="button"
                onClick={resetFile}
                className="mt-2 text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Remove file
              </button>
            )}
          </div>
        ) : (
          <>
            <Upload className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Drop a CSV file here
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Choose file
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="sr-only"
          data-testid="csv-file-input"
        />
      </div>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/40">
          <p className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
            <XCircle className="h-4 w-4 shrink-0" />
            {parseErrors.length} row{parseErrors.length !== 1 ? "s" : ""} skipped before import
          </p>
          <ul className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300">
            {parseErrors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {parseErrors.length > 10 && (
              <li>… and {parseErrors.length - 10} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Import button */}
      {parsedRows.length > 0 && !importResult && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            data-testid="import-commit-button"
          >
            {importing ? "Importing…" : `Import ${parsedRows.length} rows`}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each row is committed individually. You can re-upload to add more later.
          </p>
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              Import complete — batch {importResult.batch_id?.slice(0, 8)}
            </p>
          </div>
          <SummaryBar result={importResult} />
          <RowResultTable rows={importResult.rows} />
          {(importResult.needs_review > 0 || importResult.error > 0) && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Rows marked &quot;needs review&quot; were not imported. Fix the issues in your
              spreadsheet and re-upload — already-imported rows will be skipped automatically.
            </p>
          )}
          <button
            type="button"
            onClick={resetFile}
            className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Import another file
          </button>
        </div>
      )}

      {/* Recent batches */}
      <RecentBatches batches={batches} />
    </div>
  );
}
