import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../../context/AccountContext";
import {
  loadRraInfoSheetVs0Map,
  previewRraInfoSheetEvaluationForTenancy,
  runRraInfoSheetEvaluationForTenancy,
} from "../../services/regulatoryProofEngineService";

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function leaseLabel(lease) {
  const tenant = lease?.tenantLabel || lease?.tenant?.name || lease?.tenant_id || "Unknown tenant";
  const property = lease?.propertyLabel || lease?.property?.address || lease?.property_id || "Unknown property";
  const start = lease?.lease_start_date || "no start";
  const end = lease?.lease_end_date || "open end";
  return `${tenant} · ${property} · ${start} → ${end}`;
}

function resultBadge(result) {
  const value = String(result || "not_run");
  const classes = {
    affected: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200",
    not_affected: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    deferred: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-200",
    needs_data: "border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-200",
    not_run: "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[value] || classes.not_run}`}>
      {value}
    </span>
  );
}

export default function RpeDiagnosticPage({ leases = [] }) {
  const { activeAccountId } = useAccount();
  const [selectedLeaseId, setSelectedLeaseId] = useState("");
  const [readiness, setReadiness] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");

  const selectedLease = useMemo(
    () => leases.find((lease) => String(lease.id) === String(selectedLeaseId)) || null,
    [leases, selectedLeaseId],
  );

  const canRun = Boolean(activeAccountId && selectedLeaseId);

  async function runAction(action, callback) {
    setError("");
    setLoadingAction(action);
    try {
      await callback();
    } catch (err) {
      setError(err?.message || "Regulatory proof engine diagnostic failed");
    } finally {
      setLoadingAction("");
    }
  }

  async function handleLoadReadiness() {
    await runAction("readiness", async () => {
      const result = await loadRraInfoSheetVs0Map({
        accountId: activeAccountId,
        tenancyId: selectedLeaseId,
      });
      setReadiness(result);
      setEvaluation(null);
    });
  }

  async function handlePreviewEvaluation() {
    await runAction("preview", async () => {
      const result = await previewRraInfoSheetEvaluationForTenancy({
        accountId: activeAccountId,
        tenancyId: selectedLeaseId,
        demoMode: true,
      });
      setReadiness(result.input_snapshot);
      setEvaluation(result);
    });
  }

  async function handleRecordEvaluation() {
    await runAction("record", async () => {
      const result = await runRraInfoSheetEvaluationForTenancy({
        accountId: activeAccountId,
        tenancyId: selectedLeaseId,
        demoMode: true,
      });
      setReadiness(result.input_snapshot);
      setEvaluation(result);
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Renters’ Rights / Regulatory Proof Engine
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
            RPE manual diagnostic
          </h1>
        </div>
        <Link
          to="/compliance/renters-rights"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back to Renters’ Rights
        </Link>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-100">
        This page is a manual smoke-test surface. It calls the RPE RPCs through
        your logged-in browser session, so account authorization is tested
        without bypassing RLS or SECURITY DEFINER guards. Evaluation actions run
        in demo mode because this is not yet a production legal-decision surface.
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Tenancy / lease
            </span>
            <select
              value={selectedLeaseId}
              onChange={(event) => {
                setSelectedLeaseId(event.target.value);
                setReadiness(null);
                setEvaluation(null);
                setError("");
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">Select a lease…</option>
              {leases.map((lease) => (
                <option key={lease.id} value={lease.id}>
                  {leaseLabel(lease)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canRun || loadingAction}
              onClick={handleLoadReadiness}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {loadingAction === "readiness" ? "Loading…" : "Load readiness only"}
            </button>
            <button
              type="button"
              disabled={!canRun || loadingAction}
              onClick={handlePreviewEvaluation}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {loadingAction === "preview" ? "Previewing…" : "Preview evaluation"}
            </button>
            <button
              type="button"
              disabled={!canRun || loadingAction}
              onClick={handleRecordEvaluation}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingAction === "record" ? "Recording…" : "Run + record"}
            </button>
          </div>
        </div>

        {selectedLease && (
          <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Lease ID</dt>
              <dd className="break-all font-mono text-xs text-slate-800 dark:text-slate-200">{selectedLease.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Tenant</dt>
              <dd className="text-slate-800 dark:text-slate-200">{selectedLease.tenantLabel || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Property</dt>
              <dd className="text-slate-800 dark:text-slate-200">{selectedLease.propertyLabel || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Dates</dt>
              <dd className="text-slate-800 dark:text-slate-200">
                {selectedLease.lease_start_date || "—"} → {selectedLease.lease_end_date || "open end"}
              </dd>
            </div>
          </dl>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-100">
            {error}
          </div>
        )}
      </section>

      {evaluation && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Evaluation result
            </h2>
            {resultBadge(evaluation.result)}
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Reason codes</div>
              <div className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                {(evaluation.reason_codes || []).join(", ") || "—"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Missing fields</div>
              <div className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                {(evaluation.missing_fields || []).join(", ") || "—"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Recorded evaluation ID</div>
              <div className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200">
                {evaluation.id || "not recorded"}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            VS-0 readiness map
          </h2>
          <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
            {readiness ? formatJson(readiness) : "No readiness loaded yet."}
          </pre>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Full evaluation payload
          </h2>
          <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
            {evaluation ? formatJson(evaluation) : "No evaluation run yet."}
          </pre>
        </div>
      </section>
    </div>
  );
}
