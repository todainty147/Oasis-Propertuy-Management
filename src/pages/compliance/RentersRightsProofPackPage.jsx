import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, FileText, Info } from "lucide-react";
import { useAccount } from "../../context/AccountContext";
import {
  getObligationProofPack,
  listRraObligationInstances,
} from "../../services/regulatoryProofEngineService";
import ObligationProofPackPanel from "../../components/compliance/ObligationProofPackPanel";
import { rraProofPackLabels, proofPackPdfOptions } from "../../components/compliance/proofPackPresentation";
import { downloadProofPackPdf } from "../../utils/proofPackPdfExport";

function formatTimestamp(val) {
  if (!val) return "Not recorded";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString();
}

function obligationLabel(row) {
  const kind = String(row?.obligation_kind || "RRA information sheet").replace(/_/g, " ");
  const posture = String(row?.posture || "unknown").replace(/_/g, " ");
  const id = row?.id ? String(row.id).slice(0, 8) : "unknown";
  const changed = row?.last_transition_at ? ` · ${formatTimestamp(row.last_transition_at)}` : "";
  return `${kind} · ${posture} · ${id}${changed}`;
}

export default function RentersRightsProofPackPage() {
  const { activeAccountId, isRootOperator } = useAccount();
  const { obligationInstanceId } = useParams();
  const navigate = useNavigate();
  const [obligations, setObligations] = useState([]);
  const [selectedId, setSelectedId] = useState(obligationInstanceId || "");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedObligation = useMemo(
    () => obligations.find((row) => String(row.id) === String(selectedId)) || null,
    [obligations, selectedId],
  );

  useEffect(() => {
    setSelectedId(obligationInstanceId || "");
  }, [obligationInstanceId]);

  useEffect(() => {
    if (!activeAccountId) return;
    let cancelled = false;
    setError("");
    listRraObligationInstances({ accountId: activeAccountId })
      .then((rows) => {
        if (!cancelled) setObligations(rows || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load proof pack references");
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId || !obligationInstanceId) {
      setPayload(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    getObligationProofPack({
      accountId: activeAccountId,
      obligationInstanceId,
    })
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPayload(null);
          setError(err?.message || "Failed to load proof pack");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, obligationInstanceId]);

  function handleOpenSelected() {
    if (!selectedId) return;
    navigate(`/compliance/renters-rights/proof-pack/${selectedId}`);
  }

  function handleExport(currentPayload) {
    downloadProofPackPdf(currentPayload, proofPackPdfOptions(rraProofPackLabels));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Renters’ Rights / Proof Pack
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
            RRA Information Sheet Proof Pack
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            A customer-readable view of recorded assessment, service evidence,
            current state, and proof trail for one obligation.
          </p>
        </div>
        <Link
          to="/compliance/renters-rights"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back to Renters’ Rights
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Pack reference
            </span>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              data-testid="proof-pack-obligation-selector"
            >
              <option value="">Select a proof pack…</option>
              {obligations.map((row) => (
                <option key={row.id} value={row.id}>
                  {obligationLabel(row)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleOpenSelected}
            disabled={!selectedId}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            data-testid="proof-pack-open-selected"
          >
            Open proof pack
          </button>
        </div>
        {selectedObligation && (
          <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950 sm:grid-cols-3">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Pack reference</dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200">
                {selectedObligation.id}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Current posture</dt>
              <dd className="mt-1 text-slate-800 dark:text-slate-200">
                {String(selectedObligation.posture || "unknown").replace(/_/g, " ")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Last transition</dt>
              <dd className="mt-1 text-slate-800 dark:text-slate-200">
                {formatTimestamp(selectedObligation.last_transition_at)}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {error && (
        <div
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!obligationInstanceId && obligations.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center dark:border-slate-700">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No proof pack records yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Information-sheet tasks and proof pack records are separate systems.
            Marking an information sheet as sent on the{" "}
            <Link
              to="/compliance/renters-rights"
              className="underline hover:text-slate-700 dark:hover:text-slate-200"
            >
              Renters' Rights page
            </Link>{" "}
            now creates a proof pack record automatically. If tasks were marked
            sent before this update, open the task and mark it sent again to
            create the record.
          </p>
          {isRootOperator && (
            <div className="mx-auto mt-5 max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-800">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Internal support
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Run the full RPE diagnostic to create obligation instances directly.
              </p>
              <Link
                to="/internal/compliance/renters-rights/rpe-diagnostic"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
              >
                Open RPE diagnostic
              </Link>
            </div>
          )}
        </div>
      )}

      {!obligationInstanceId && obligations.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select a pack reference to open a customer-readable proof pack.
          </p>
        </div>
      )}

      {obligationInstanceId && loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Loading proof pack…
        </div>
      )}

      {obligationInstanceId && !loading && payload && (
        <ObligationProofPackPanel
          payload={payload}
          mode="customer"
          labels={rraProofPackLabels}
          showVerificationDetails
          exportAction={handleExport}
        />
      )}
    </div>
  );
}
