import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Clock, ShieldAlert, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Calendar, Building2, ExternalLink,
} from "lucide-react";
import { useAccount } from "../../context/AccountContext";
import DashboardBreadcrumbs from "../../components/DashboardBreadcrumbs";
import {
  rootListAccountsWithBilling,
  createOaGrant,
  generateOaCheckoutLink,
  activateOaPaymentLink,
  cancelOaGrant,
  setAccountTrialEnd,
  removeAccountTrialCap,
} from "../../services/operatorAgencyService";

function formatDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function daysUntil(v) {
  if (!v) return null;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000);
}

function planBadge(plan, oaStatus) {
  if (oaStatus === "active") return { label: "OA Active", cls: "bg-emerald-100 text-emerald-700" };
  if (["pending_payment", "pending_checkout", "draft"].includes(oaStatus || ""))
    return { label: "OA Pending", cls: "bg-amber-100 text-amber-700" };
  if (oaStatus === "expired") return { label: "OA Expired", cls: "bg-rose-100 text-rose-700" };
  const p = String(plan || "starter").toLowerCase();
  const MAP = {
    operator_agency:         { label: "Operator/Agency",  cls: "bg-fuchsia-100 text-fuchsia-700" },
    operator_agency_pending: { label: "OA Pending",       cls: "bg-amber-100 text-amber-700" },
    oa_contract_expired:     { label: "OA Expired",       cls: "bg-rose-100 text-rose-700" },
    pro:                     { label: "Pro",              cls: "bg-violet-100 text-violet-700" },
    growth:                  { label: "Growth",           cls: "bg-blue-100 text-blue-700" },
    starter:                 { label: "Starter",          cls: "bg-slate-100 text-slate-600" },
    trial_expired:           { label: "Trial Expired",    cls: "bg-rose-100 text-rose-700" },
    billing_past_due_locked: { label: "Past Due",         cls: "bg-orange-100 text-orange-700" },
    billing_locked:          { label: "Billing Locked",   cls: "bg-rose-100 text-rose-700" },
  };
  return MAP[p] || MAP.starter;
}

// ── Trial Panel ───────────────────────────────────────────────────────────────

function TrialPanel({ account, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  async function handleExtend(e) {
    e.preventDefault();
    if (!date || !reason.trim()) return;
    try {
      setBusy(true); setMsg("");
      await setAccountTrialEnd({ targetAccountId: account.id, trialEndsAt: new Date(date).toISOString(), reason });
      setMsg("Trial end updated."); setDate(""); setReason("");
      onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  async function handleRemoveCap(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    if (!window.confirm("Remove trial cap for this account permanently?")) return;
    try {
      setBusy(true); setMsg("");
      await removeAccountTrialCap({ targetAccountId: account.id, reason });
      setMsg("Trial cap removed."); setReason("");
      onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  const days = daysUntil(account.trialEndsAt);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Trial</p>
      <div className="mb-3 text-sm text-slate-700 dark:text-slate-200">
        {account.trialEndsAt
          ? <>Trial ends: <strong>{formatDate(account.trialEndsAt)}</strong>
            {days !== null && <span className={`ml-2 text-xs font-medium ${days < 0 ? "text-rose-600" : days <= 3 ? "text-amber-600" : "text-slate-500"}`}>
              {days < 0 ? `${Math.abs(days)}d ago (expired)` : `${days}d left`}
            </span>}
            </>
          : <span className="text-slate-400">No trial (grandfathered)</span>}
      </div>
      {msg && <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">{msg}</p>}
      <form onSubmit={handleExtend} className="space-y-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <input
          type="text"
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !date || !reason.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Set trial end
          </button>
          <button
            type="button"
            onClick={handleRemoveCap}
            disabled={busy || !reason.trim()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
          >
            Remove cap
          </button>
        </div>
      </form>
    </div>
  );
}

// ── OA Grant Panel ────────────────────────────────────────────────────────────

function OaGrantPanel({ account, onRefresh }) {
  const [busy,   setBusy]   = useState(false);
  const [msg,    setMsg]    = useState("");
  const [form,   setForm]   = useState({
    unitCount: "", subscriptionStart: "", subscriptionEnd: "", reason: "",
  });
  const [checkoutUrl, setCheckoutUrl] = useState(null);

  const hasGrant = Boolean(account.oaPaymentStatus);

  function f(k) { return (v) => setForm((p) => ({ ...p, [k]: v })); }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      setBusy(true); setMsg("");
      const grantId = await createOaGrant({
        targetAccountId:  account.id,
        unitCount:        parseInt(form.unitCount, 10),
        subscriptionStart: form.subscriptionStart,
        subscriptionEnd:   form.subscriptionEnd || null,
        reason:            form.reason,
      });
      setMsg(`Grant created (id: ${grantId}). Generate the checkout link.`);
      setCheckoutUrl(null);
      onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  async function handleGenerateLink() {
    try {
      setBusy(true); setMsg("");
      const { checkout_url } = await generateOaCheckoutLink({ grantId: account._grantId, accountId: account.id });
      setCheckoutUrl(checkout_url);
      setMsg("Checkout link generated. Send this to the account and then click 'Mark as sent'.");
      onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  async function handleMarkSent() {
    const reason = window.prompt("Reason / notes:");
    if (!reason?.trim()) return;
    try {
      setBusy(true); setMsg("");
      await activateOaPaymentLink({ grantId: account._grantId, reason });
      setMsg("Payment link marked as sent to account."); onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  async function handleCancel() {
    const reason = window.prompt("Cancellation reason:");
    if (!reason?.trim()) return;
    if (!window.confirm("Cancel this OA grant?")) return;
    try {
      setBusy(true); setMsg("");
      await cancelOaGrant({ grantId: account._grantId, immediate: true, cancellationReason: reason });
      setMsg("Grant cancelled."); onRefresh();
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700 mb-3">
        Operator/Agency Grant
      </p>

      {msg && <p className="mb-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white/60 rounded px-2 py-1">{msg}</p>}

      {/* No grant — create form */}
      {!hasGrant && (
        <form onSubmit={handleCreate} className="space-y-2">
          <input
            type="number" min="1" placeholder="Units (required)"
            value={form.unitCount} onChange={(e) => f("unitCount")(e.target.value)}
            className="w-full rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 text-sm dark:border-fuchsia-700 dark:bg-slate-900"
            required
          />
          <div className="flex gap-2">
            <input
              type="date" placeholder="Start" value={form.subscriptionStart}
              onChange={(e) => f("subscriptionStart")(e.target.value)}
              className="flex-1 rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 text-sm dark:border-fuchsia-700 dark:bg-slate-900"
              required
            />
            <input
              type="date" placeholder="End (optional)" value={form.subscriptionEnd}
              onChange={(e) => f("subscriptionEnd")(e.target.value)}
              className="flex-1 rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 text-sm dark:border-fuchsia-700 dark:bg-slate-900"
            />
          </div>
          <input
            type="text" placeholder="Reason / sales notes (required)"
            value={form.reason} onChange={(e) => f("reason")(e.target.value)}
            className="w-full rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 text-sm dark:border-fuchsia-700 dark:bg-slate-900"
            required
          />
          <button
            type="submit" disabled={busy}
            className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-700 disabled:opacity-50"
          >
            Create grant
          </button>
        </form>
      )}

      {/* Has grant — show status and actions */}
      {hasGrant && (
        <div className="space-y-3">
          <div className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
            <div>Status: <strong>{account.oaPaymentStatus}</strong></div>
            {account.oaSubscriptionEnd && (
              <div>Contract end: <strong>{formatDate(account.oaSubscriptionEnd)}</strong></div>
            )}
            {account.oaUnitCount && (
              <div>Units: <strong>{account.oaUnitCount}</strong></div>
            )}
          </div>

          {checkoutUrl && (
            <div className="rounded-lg border border-fuchsia-200 bg-white p-2 break-all text-xs text-fuchsia-700">
              <p className="font-semibold mb-1">Checkout URL (send to account):</p>
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {checkoutUrl}
              </a>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {account.oaPaymentStatus === "draft" && (
              <button
                type="button" onClick={handleGenerateLink} disabled={busy}
                className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-700 disabled:opacity-50"
              >
                Generate checkout link
              </button>
            )}
            {account.oaPaymentStatus === "pending_checkout" && (
              <button
                type="button" onClick={handleMarkSent} disabled={busy}
                className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-700 disabled:opacity-50"
              >
                Mark as sent to account
              </button>
            )}
            {["draft", "pending_checkout", "pending_payment", "active"].includes(account.oaPaymentStatus) && (
              <button
                type="button" onClick={handleCancel} disabled={busy}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Cancel grant
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Account Row ───────────────────────────────────────────────────────────────

function AccountRow({ account, onRefresh }) {
  const [open, setOpen] = useState(false);
  const badge = planBadge(account.subscriptionPlan, account.oaPaymentStatus);
  const days  = daysUntil(account.trialEndsAt);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Building2 size={16} className="shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate dark:text-slate-100">
              {account.name}
              {account.isRoot && (
                <span className="ml-2 text-xs font-normal text-fuchsia-600">(root)</span>
              )}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {account.id.slice(0, 8)}… · created {formatDate(account.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          {account.trialEndsAt && days !== null && (
            <span className={`hidden sm:inline-flex items-center gap-1 text-xs ${days < 0 ? "text-rose-500" : days <= 3 ? "text-amber-500" : "text-slate-400"}`}>
              <Clock size={11} />
              {days < 0 ? `${Math.abs(days)}d expired` : `${days}d trial`}
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {open && !account.isRoot && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800 grid gap-4 sm:grid-cols-2">
          <TrialPanel account={account} onRefresh={onRefresh} />
          <OaGrantPanel account={{ ...account, _grantId: account._grantId }} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RootAccountsPage() {
  const { isRootOperator, accounts, activeAccountId } = useAccount();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");

  const rootAccountId = useMemo(
    () => accounts.find((a) => a.is_root)?.id || activeAccountId,
    [accounts, activeAccountId],
  );

  const load = useCallback(async () => {
    if (!rootAccountId) return;
    try {
      setLoading(true); setError("");
      const data = await rootListAccountsWithBilling(rootAccountId);
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [rootAccountId]);

  useEffect(() => { load(); }, [load]);

  if (!isRootOperator) {
    return (
      <div className="p-6 text-sm text-rose-600">Root operator access required.</div>
    );
  }

  const filtered = rows.filter((r) => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.id.startsWith(search))
      return false;
    if (filter === "trial_active")   return r.trialEndsAt && new Date(r.trialEndsAt) > new Date();
    if (filter === "trial_expiring") {
      const d = daysUntil(r.trialEndsAt);
      return d !== null && d >= 0 && d <= 7;
    }
    if (filter === "trial_expired")  return r.trialEndsAt && new Date(r.trialEndsAt) <= new Date() && !r.oaPaymentStatus;
    if (filter === "oa_pending")     return ["draft","pending_checkout","pending_payment"].includes(r.oaPaymentStatus || "");
    if (filter === "oa_active")      return r.oaPaymentStatus === "active";
    return true;
  });

  const counts = {
    all:            rows.length,
    trial_active:   rows.filter((r) => r.trialEndsAt && new Date(r.trialEndsAt) > new Date()).length,
    trial_expiring: rows.filter((r) => { const d = daysUntil(r.trialEndsAt); return d !== null && d >= 0 && d <= 7; }).length,
    trial_expired:  rows.filter((r) => r.trialEndsAt && new Date(r.trialEndsAt) <= new Date()).length,
    oa_pending:     rows.filter((r) => ["draft","pending_checkout","pending_payment"].includes(r.oaPaymentStatus || "")).length,
    oa_active:      rows.filter((r) => r.oaPaymentStatus === "active").length,
  };

  const FILTERS = [
    { key: "all",            label: `All (${counts.all})` },
    { key: "trial_active",   label: `Trial active (${counts.trial_active})` },
    { key: "trial_expiring", label: `Expiring ≤7d (${counts.trial_expiring})`, warn: counts.trial_expiring > 0 },
    { key: "trial_expired",  label: `Expired (${counts.trial_expired})`,        warn: counts.trial_expired > 0 },
    { key: "oa_pending",     label: `OA pending (${counts.oa_pending})`,        warn: counts.oa_pending > 0 },
    { key: "oa_active",      label: `OA active (${counts.oa_active})` },
  ];

  return (
    <div className="space-y-4">
      <DashboardBreadcrumbs items={[{ label: "Root" }, { label: "Account Management" }]} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Account Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage trials, Operator/Agency grants, and billing for all landlord accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.key
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : f.warn
                ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or account ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading accounts…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No accounts match this filter.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((account) => (
            <AccountRow key={account.id} account={account} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
