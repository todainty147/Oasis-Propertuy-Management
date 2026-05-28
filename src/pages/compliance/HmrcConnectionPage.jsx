import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, PlugZap, RefreshCw, Save, ShieldAlert, Trash2, Unplug } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import {
  disconnectHmrc,
  getHmrcConnectionStatus,
  normalizeHmrcConnectionStatus,
  createHmrcTestBusiness,
  createHmrcTestItsaStatus,
  deleteHmrcTestBusiness,
  readHmrcBusinessDetails,
  readHmrcObligations,
  readHmrcPropertyBusiness,
  refreshHmrcConnection,
  runHmrcReadonlyVerification,
  saveHmrcSandboxProfile,
  startHmrcSandboxOAuth,
  startHmrcSandboxTestDataOAuth,
  testHmrcReadonlyCall,
} from "../../services/hmrcMtdService";

const READ_ONLY_SCOPES = ["hello", "read:self-assessment"];

function formatDateTime(value) {
  if (!value) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Not recorded";
  }
}

function statusLabel(status) {
  return normalizeHmrcConnectionStatus(status).replace(/_/g, " ");
}

export default function HmrcConnectionPage() {
  const { activeAccountId, hasEntitlement } = useAccount();
  const [connection, setConnection] = useState(null);
  const [sandboxProfile, setSandboxProfile] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [readinessChecks, setReadinessChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [testDataResult, setTestDataResult] = useState(null);
  const [sandboxNino, setSandboxNino] = useState("");
  const [testTaxYear, setTestTaxYear] = useState("2026-27");
  const [testBusinessType, setTestBusinessType] = useState("uk-property");

  const canReadOnly = hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_READ_ONLY);
  const canTestData = hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_SANDBOX_TEST_DATA);
  const canConnectSandbox = hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_CONNECTION) && hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_SANDBOX);
  const status = normalizeHmrcConnectionStatus(connection?.connection_status);
  const isConnected = status === "connected";

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      setError("");
      const next = await getHmrcConnectionStatus(activeAccountId);
      setConnection(next.connection);
      setSandboxProfile(next.sandboxProfile);
      setAuditEvents(next.auditEvents || []);
      setReadinessChecks(next.readinessChecks || []);
    } catch (err) {
      setError(err?.message || "Could not load HMRC connection status.");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const grantedScopes = useMemo(() => connection?.scopes || [], [connection?.scopes]);
  const hasTestDataScope = grantedScopes.includes("write:self-assessment");

  async function handleConnect() {
    try {
      setBusyAction("connect");
      setError("");
      const { redirectUrl } = await startHmrcSandboxOAuth(activeAccountId, READ_ONLY_SCOPES);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err?.message || "Could not start HMRC sandbox connection.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleConnectForTestData() {
    try {
      setBusyAction("connect-test-data");
      setError("");
      const { redirectUrl } = await startHmrcSandboxTestDataOAuth(activeAccountId);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err?.message || "Could not start HMRC sandbox test-data connection.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleRefresh() {
    try {
      setBusyAction("refresh");
      setError("");
      await refreshHmrcConnection(activeAccountId);
      await load();
    } catch (err) {
      setError(err?.message || "Could not refresh HMRC sandbox connection.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleTest() {
    try {
      setBusyAction("test");
      setError("");
      setResult(await testHmrcReadonlyCall(activeAccountId));
      await load();
    } catch (err) {
      setError(err?.message || "Could not test HMRC sandbox connection.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleSaveSandboxProfile() {
    try {
      setBusyAction("save-profile");
      setError("");
      setSandboxProfile(await saveHmrcSandboxProfile(activeAccountId, { nino: sandboxNino }));
      setSandboxNino("");
      await load();
    } catch (err) {
      setError(err?.message || "Could not save HMRC sandbox test identifier.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleVerification(action, runner) {
    try {
      setBusyAction(action);
      setError("");
      const next = await runner(activeAccountId);
      setVerificationResult(next);
      await load();
    } catch (err) {
      setError(err?.message || "Could not run HMRC read-only verification.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleTestDataAction(action, runner) {
    try {
      setBusyAction(action);
      setError("");
      setTestDataResult(null);
      const next = await runner(activeAccountId, { taxYear: testTaxYear, typeOfBusiness: testBusinessType });
      setTestDataResult(next);
      await load();
    } catch (err) {
      setTestDataResult({
        status: "failed",
        message: err?.message || "Could not update HMRC sandbox test data. Check the Edge Function deployment and HMRC sandbox scopes.",
      });
    } finally {
      setBusyAction("");
    }
  }

  async function handleDisconnect() {
    const confirmed = window.confirm("Disconnect HMRC sandbox for this account? Tokens will be cleared from Tenaqo.");
    if (!confirmed) return;
    try {
      setBusyAction("disconnect");
      setError("");
      await disconnectHmrc(activeAccountId);
      setResult(null);
      await load();
    } catch (err) {
      setError(err?.message || "Could not disconnect HMRC.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Making Tax Digital</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">HMRC Connection</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Connect an HMRC sandbox account for read-only integration testing. No submissions are enabled from this screen.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Connection status</h2>
              <p className="mt-1 text-sm text-slate-500">Environment: Sandbox</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <CheckCircle2 size={14} className={isConnected ? "text-teal-500" : "text-slate-400"} />
              {loading ? "Loading" : statusLabel(status)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <InfoTile label="Last connected" value={formatDateTime(connection?.last_connected_at)} />
            <InfoTile label="Last refreshed" value={formatDateTime(connection?.last_refreshed_at)} />
            <InfoTile label="Display label" value={connection?.hmrc_display_label || "Not connected"} />
            <InfoTile label="Scopes granted" value={grantedScopes.length ? grantedScopes.join(", ") : "None"} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canConnectSandbox || busyAction === "connect"}
              onClick={handleConnect}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <ExternalLink size={16} /> {busyAction === "connect" ? "Opening HMRC..." : "Connect HMRC sandbox"}
            </button>
            <button
              type="button"
              disabled={!isConnected || busyAction === "refresh"}
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
            >
              <RefreshCw size={16} /> Refresh token
            </button>
            <button
              type="button"
              disabled={!isConnected || busyAction === "disconnect"}
              onClick={handleDisconnect}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
            >
              <Unplug size={16} /> Disconnect HMRC
            </button>
          </div>
        </div>

        <aside className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-sm text-teal-950 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-100">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0" size={18} />
            <div>
              <h2 className="font-semibold">No submissions enabled</h2>
              <p className="mt-2">
                This connection is currently sandbox-only. Tenaqo will not submit MTD updates or final declarations to HMRC from this screen.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Read-only test</h2>
            <p className="mt-1 text-sm text-slate-500">Runs a harmless HMRC sandbox read-only check where scopes allow. Tokens are never shown in the browser.</p>
          </div>
          <button
            type="button"
            disabled={!isConnected || !canReadOnly || busyAction === "test"}
            onClick={handleTest}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            <PlugZap size={16} /> {busyAction === "test" ? "Testing..." : "Test sandbox connection"}
          </button>
        </div>
        {result ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="font-medium capitalize">{result.status}</p>
            <p className="mt-1 text-slate-500">{result.message}</p>
            {result.responseSummary?.user_restricted_code || result.responseSummary?.user_restricted_status ? (
              <p className="mt-2 text-xs text-slate-500">
                HMRC user test: {result.responseSummary.user_restricted_status || "unknown"}
                {result.responseSummary.user_restricted_code ? ` (${result.responseSummary.user_restricted_code})` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">MTD Sandbox Verification</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Verifies subscribed MTD read-only sandbox APIs. This does not submit quarterly updates, annual updates or final declarations.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-800 dark:text-teal-300">
            <ShieldAlert size={14} /> Live submission disabled
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <VerificationPill label="OAuth connected" active={isConnected} />
          <VerificationPill label="Business Details" active={latestCheck(readinessChecks, "business_details")?.status === "success"} />
          <VerificationPill label="Obligations checked" active={Boolean(latestCheck(readinessChecks, "obligations_income_and_expenditure"))} />
          <VerificationPill label="Property Business" active={Boolean(latestCheck(readinessChecks, "property_business_read"))} />
          <VerificationPill label="No submissions" active />
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="hmrc-sandbox-nino">Sandbox NINO / test identifier</label>
          <div className="mt-2 flex flex-col gap-3 md:flex-row">
            <input
              id="hmrc-sandbox-nino"
              value={sandboxNino}
              onChange={(event) => setSandboxNino(event.target.value)}
              placeholder={sandboxProfile?.ninoMasked || "Example: AA000000A"}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              disabled={!isConnected || busyAction === "save-profile"}
              onClick={handleSaveSandboxProfile}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
            >
              <Save size={16} /> {busyAction === "save-profile" ? "Saving..." : "Save identifier"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Stored server-side for sandbox checks only. Current profile: {sandboxProfile?.hasNino ? sandboxProfile.ninoMasked : "No sandbox NINO saved"}.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!isConnected || !canReadOnly || busyAction === "run-verification"}
            onClick={() => handleVerification("run-verification", runHmrcReadonlyVerification)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busyAction === "run-verification" ? "Running..." : "Run read-only verification"}
          </button>
          <CheckButton label="Check Business Details" action="business-details" busyAction={busyAction} disabled={!isConnected || !canReadOnly} onClick={() => handleVerification("business-details", readHmrcBusinessDetails)} />
          <CheckButton label="Check Obligations" action="obligations" busyAction={busyAction} disabled={!isConnected || !canReadOnly} onClick={() => handleVerification("obligations", readHmrcObligations)} />
          <CheckButton label="Check Property Business" action="property-business" busyAction={busyAction} disabled={!isConnected || !canReadOnly} onClick={() => handleVerification("property-business", readHmrcPropertyBusiness)} />
        </div>

        {verificationResult ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="font-medium capitalize">{verificationResult.overallStatus || verificationResult.status}</p>
            <p className="mt-1 text-slate-500">{verificationResult.message}</p>
            {Array.isArray(verificationResult.checks) ? (
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {verificationResult.checks.map((check) => <CheckResult key={check.checkType} check={check} />)}
              </div>
            ) : <CheckResult check={verificationResult} />}
          </div>
        ) : null}
      </section>

      {canTestData ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Sandbox test-data setup</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                Creates HMRC sandbox-only MTD test state so the read-only probes can find Business Details and obligations. This does not enable live submissions.
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:text-amber-200">
              Sandbox mutation
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Tax year
              <input
                value={testTaxYear}
                onChange={(event) => setTestTaxYear(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="2026-27"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Test business type
              <select
                value={testBusinessType}
                onChange={(event) => setTestBusinessType(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="uk-property">UK property</option>
                <option value="foreign-property">Foreign property</option>
                <option value="property-unspecified">Property unspecified</option>
                <option value="self-employment">Self-employment</option>
              </select>
            </label>
            <div className="rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-600 dark:border-amber-900/50 dark:bg-slate-950 dark:text-slate-300">
              Current test business: {sandboxProfile?.hasTestBusinessId ? `${sandboxProfile.testBusinessType || "configured"} (${sandboxProfile.testBusinessIdMasked})` : "None stored"}.
            </div>
          </div>

          <div className={`mt-4 rounded-xl border p-3 text-sm ${hasTestDataScope ? "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-100" : "border-amber-200 bg-white text-amber-900 dark:border-amber-900/50 dark:bg-slate-950 dark:text-amber-100"}`}>
            <p className="font-medium">Test-data scope: {hasTestDataScope ? "granted" : "missing"}</p>
            <p className="mt-1 text-xs opacity-80">
              {hasTestDataScope
                ? "This sandbox token includes write:self-assessment for HMRC test-support setup only."
                : "Reconnect with test-data scope and authorise again before creating ITSA status or a test business."}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canConnectSandbox || busyAction === "connect-test-data"}
              onClick={handleConnectForTestData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
            >
              <ExternalLink size={16} /> {busyAction === "connect-test-data" ? "Opening HMRC..." : "Reconnect with test-data scope"}
            </button>
            <CheckButton label="Create ITSA status" action="create-itsa" busyAction={busyAction} disabled={!isConnected || !canReadOnly || !hasTestDataScope} onClick={() => handleTestDataAction("create-itsa", createHmrcTestItsaStatus)} />
            <CheckButton label="Create test business" action="create-business" busyAction={busyAction} disabled={!isConnected || !canReadOnly || !hasTestDataScope} onClick={() => handleTestDataAction("create-business", createHmrcTestBusiness)} />
            <button
              type="button"
              disabled={!isConnected || !canReadOnly || !hasTestDataScope || busyAction === "delete-business" || !sandboxProfile?.hasTestBusinessId}
              onClick={() => handleTestDataAction("delete-business", deleteHmrcTestBusiness)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-200"
            >
              <Trash2 size={16} /> {busyAction === "delete-business" ? "Deleting..." : "Delete test business"}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            HMRC requires `write:self-assessment` for sandbox test-support endpoints. Use this only with HMRC sandbox test users.
          </p>

          {testDataResult ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm dark:border-amber-900/50 dark:bg-slate-950">
              <p className="font-medium capitalize">{testDataResult.status}</p>
              <p className="mt-1 text-slate-500">{testDataResult.message}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Recent HMRC audit events</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          {auditEvents.length ? auditEvents.map((event) => (
            <div key={event.id} className="grid gap-2 border-b border-slate-100 p-3 text-sm last:border-b-0 dark:border-slate-800 md:grid-cols-[1fr_120px_160px]">
              <span>{event.action}</span>
              <span className="capitalize text-slate-500">{event.status}</span>
              <span className="text-slate-500">{formatDateTime(event.created_at)}</span>
              {event.error_message ? <span className="text-rose-500 md:col-span-3">{event.error_message}</span> : null}
            </div>
          )) : (
            <p className="p-4 text-sm text-slate-500">No HMRC audit events yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function latestCheck(checks, checkType) {
  return checks.find((check) => check.check_type === checkType);
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function VerificationPill({ label, active }) {
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs font-medium ${active ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950"}`}>
      {label}
    </div>
  );
}

function CheckButton({ label, action, busyAction, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled || busyAction === action}
      onClick={onClick}
      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
    >
      {busyAction === action ? "Checking..." : label}
    </button>
  );
}

function CheckResult({ check }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{String(check.checkType || check.check_type || "").replace(/_/g, " ")}</p>
      <p className="mt-1 font-medium capitalize">{check.status}</p>
      <p className="mt-1 text-xs text-slate-500">{check.message || check.hmrc_code || check.summary?.safeCode || "Safe summary stored."}</p>
    </div>
  );
}
