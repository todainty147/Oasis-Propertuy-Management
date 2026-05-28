import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, PlugZap, RefreshCw, ShieldAlert, Unplug } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import {
  disconnectHmrc,
  getHmrcConnectionStatus,
  normalizeHmrcConnectionStatus,
  refreshHmrcConnection,
  startHmrcSandboxOAuth,
  testHmrcReadonlyCall,
} from "../../services/hmrcMtdService";

const READ_ONLY_SCOPES = ["read:self-assessment"];

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
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const canReadOnly = hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_READ_ONLY);
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
      setAuditEvents(next.auditEvents || []);
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
          </div>
        ) : null}
      </section>

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

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
