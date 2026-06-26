import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../../context/AccountContext";
import {
  captureRraJurisdictionAndEvaluate,
  captureRraTermIndicatorAndEvaluate,
  captureRraTier4ClassificationAndEvaluate,
  getRraCaptureReadiness,
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
  const [captureReadiness, setCaptureReadiness] = useState(null);
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [jurisdictionCapture, setJurisdictionCapture] = useState({
    countrySubdivision: "England",
    evidenceBasis: "Manual RPE diagnostic confirmation",
  });
  const [termCapture, setTermCapture] = useState({
    termType: "periodic",
    termTypeEffectiveFrom: "2026-05-01",
    termTypeEvidenceBasis: "Manual RPE diagnostic confirmation",
  });
  const [tier4Capture, setTier4Capture] = useState({
    tenancyClass: "assured_shorthold",
    companyLet: "false",
    residentLandlord: "false",
    rentAct1977: "false",
    pbsa: "false",
    isWhollyOral: "false",
    evidenceBasis: "Manual RPE diagnostic confirmation",
  });

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
      setCaptureReadiness(null);
    });
  }

  async function refreshCaptureReadiness() {
    const result = await getRraCaptureReadiness({
      accountId: activeAccountId,
      tenancyId: selectedLeaseId,
    });
    setCaptureReadiness(result);
    return result;
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
      setCaptureReadiness(null);
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
      await refreshCaptureReadiness();
    });
  }

  async function handleLoadCaptureReadiness() {
    await runAction("capture-readiness", refreshCaptureReadiness);
  }

  async function handleCaptureJurisdiction() {
    await runAction("capture-jurisdiction", async () => {
      const propertyId = selectedLease?.property_id || selectedLease?.property?.id;
      if (!propertyId) throw new Error("Selected lease is missing property_id");

      const result = await captureRraJurisdictionAndEvaluate({
        accountId: activeAccountId,
        propertyId,
        tenancyId: selectedLeaseId,
        countrySubdivision: jurisdictionCapture.countrySubdivision,
        evidenceBasis: jurisdictionCapture.evidenceBasis,
      });

      setReadiness(result.evaluation.input_snapshot);
      setEvaluation(result.evaluation);
      await refreshCaptureReadiness();
    });
  }

  async function handleCaptureTermIndicator() {
    await runAction("capture-term", async () => {
      const result = await captureRraTermIndicatorAndEvaluate({
        accountId: activeAccountId,
        tenancyId: selectedLeaseId,
        termType: termCapture.termType,
        termTypeEffectiveFrom: termCapture.termTypeEffectiveFrom,
        termTypeEvidenceBasis: termCapture.termTypeEvidenceBasis,
      });

      setReadiness(result.evaluation.input_snapshot);
      setEvaluation(result.evaluation);
      await refreshCaptureReadiness();
    });
  }

  async function handleCaptureTier4() {
    await runAction("capture-tier4", async () => {
      const result = await captureRraTier4ClassificationAndEvaluate({
        accountId: activeAccountId,
        tenancyId: selectedLeaseId,
        tenancyClass: tier4Capture.tenancyClass,
        companyLet: tier4Capture.companyLet === "true",
        residentLandlord: tier4Capture.residentLandlord === "true",
        rentAct1977: tier4Capture.rentAct1977 === "true",
        pbsa: tier4Capture.pbsa === "true",
        isWhollyOral: tier4Capture.isWhollyOral === "true",
        evidenceBasis: tier4Capture.evidenceBasis,
      });

      setReadiness(result.evaluation.input_snapshot);
      setEvaluation(result.evaluation);
      await refreshCaptureReadiness();
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
                setCaptureReadiness(null);
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
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Reason codes</div>
              <div className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                {(evaluation.reason_codes || []).join(", ") || "—"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Missing fields</div>
              <div
                data-testid="rpe-evaluation-missing-fields"
                className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200"
              >
                {(evaluation.missing_fields || []).join(", ") || "—"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">AOD branch</div>
              <div
                data-testid="rpe-evaluation-aod-branch"
                className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200"
              >
                {evaluation.aod_branch || "—"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Recorded evaluation ID</div>
              <div
                data-testid="rpe-recorded-evaluation-id"
                className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200"
              >
                {evaluation.id || "not recorded"}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              VS-2A capture readiness
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Diagnostic-only capture. Each write records narrow RPE provenance,
              then immediately records a fresh demo evaluation.
            </p>
          </div>
          <button
            type="button"
            disabled={!canRun || loadingAction}
            onClick={handleLoadCaptureReadiness}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loadingAction === "capture-readiness" ? "Loading…" : "Load capture readiness"}
          </button>
        </div>

        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Latest result</dt>
            <dd className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
              {captureReadiness?.result || "not loaded"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Next action</dt>
            <dd
              data-testid="rpe-capture-next-action"
              className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200"
            >
              {captureReadiness?.next_capture_action || "—"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Blocking fields</dt>
            <dd className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
              {(captureReadiness?.blocking_fields || []).join(", ") || "—"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Evaluation ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200">
              {captureReadiness?.current_evaluation_id || "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              1. Jurisdiction
            </h3>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Country subdivision</span>
              <select
                value={jurisdictionCapture.countrySubdivision}
                onChange={(event) => setJurisdictionCapture((current) => ({
                  ...current,
                  countrySubdivision: event.target.value,
                }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {["England", "Wales", "Scotland", "Northern Ireland", "Other"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Evidence basis</span>
              <input
                value={jurisdictionCapture.evidenceBasis}
                onChange={(event) => setJurisdictionCapture((current) => ({
                  ...current,
                  evidenceBasis: event.target.value,
                }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <button
              type="button"
              disabled={!canRun || loadingAction}
              onClick={handleCaptureJurisdiction}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {loadingAction === "capture-jurisdiction" ? "Capturing…" : "Capture + evaluate"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              2. Active-on-date term indicator
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-300">Term type</span>
                <select
                  value={termCapture.termType}
                  onChange={(event) => setTermCapture((current) => ({
                    ...current,
                    termType: event.target.value,
                  }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="periodic">periodic</option>
                  <option value="open_ended">open_ended</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-300">Effective from</span>
                <input
                  data-testid="rpe-term-effective-from"
                  type="date"
                  value={termCapture.termTypeEffectiveFrom}
                  onChange={(event) => setTermCapture((current) => ({
                    ...current,
                    termTypeEffectiveFrom: event.target.value,
                  }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Evidence basis</span>
              <input
                data-testid="rpe-term-evidence-basis"
                value={termCapture.termTypeEvidenceBasis}
                onChange={(event) => setTermCapture((current) => ({
                  ...current,
                  termTypeEvidenceBasis: event.target.value,
                }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <button
              type="button"
              data-testid="rpe-capture-term-submit"
              disabled={!canRun || loadingAction}
              onClick={handleCaptureTermIndicator}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {loadingAction === "capture-term" ? "Capturing…" : "Capture + evaluate"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              3. Tier-4 classification
            </h3>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Tenancy class</span>
              <select
                value={tier4Capture.tenancyClass}
                onChange={(event) => setTier4Capture((current) => ({
                  ...current,
                  tenancyClass: event.target.value,
                }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {["assured_shorthold", "assured", "regulated_rent_act", "business", "agricultural", "licence", "other"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ["companyLet", "Company let"],
                ["residentLandlord", "Resident landlord"],
                ["rentAct1977", "Rent Act 1977"],
                ["pbsa", "PBSA"],
                ["isWhollyOral", "Wholly oral"],
              ].map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{label}</span>
                  <select
                    value={tier4Capture[key]}
                    onChange={(event) => setTier4Capture((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="false">false</option>
                    <option value="true">true</option>
                  </select>
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Evidence basis</span>
              <input
                value={tier4Capture.evidenceBasis}
                onChange={(event) => setTier4Capture((current) => ({
                  ...current,
                  evidenceBasis: event.target.value,
                }))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <button
              type="button"
              disabled={!canRun || loadingAction}
              onClick={handleCaptureTier4}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {loadingAction === "capture-tier4" ? "Capturing…" : "Capture + evaluate"}
            </button>
          </div>
        </div>
      </section>

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
