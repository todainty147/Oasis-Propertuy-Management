import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import ContractorAttachmentsPanel from "../components/work-orders/ContractorAttachmentsPanel";
import MaintenanceRequestAttachmentsPanel from "../components/maintenance/MaintenanceRequestAttachmentsPanel";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { createNotifications } from "../services/notificationService";
import { recordAutomationExecution } from "../services/automationExecutionService";
import {
  getContractorJobDetailsBundle,
  getContractorAllowedActions,
  updateContractorWorkOrder,
} from "../services/contractorWorkOrderService";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount, getCurrencyOptions, getDefaultCurrency } from "../utils/currency";
import {
  submitQuote as submitWorkOrderQuote,
  upsertInvoice,
  upsertQuoteDraft,
} from "../services/workOrderFinancialsService";
import { logSecurityRelevantFailure } from "../services/securityFailureLogger";
import { listWorkOrderAuditLog } from "../services/workOrderService";
import { normalizeWorkOrderStatus } from "../utils/statuses";

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatMoney(val, currency = getDefaultCurrency()) {
  return formatCurrencyAmount(val, { currency });
}

function toIsoOrNullFromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatDateOrDash(ts) {
  if (!ts) return "—";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function normalizeAckStatus(status, acknowledgedAt, dueAt) {
  if (acknowledgedAt) return "acknowledged";
  const s = String(status || "").trim().toLowerCase();
  if (s === "acknowledged") return "acknowledged";
  if (s === "not_required") return "not_required";
  if (dueAt) {
    const due = new Date(dueAt);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";
  }
  return s || "pending";
}

function isMissingAckColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42703" || message.includes("column");
}

function StatusPill({ status, t }) {
  const normalized = normalizeWorkOrderStatus(status);
  const base = "text-xs px-2 py-0.5 rounded-full border";
  if (normalized === "completed") return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>{t("status.wo.completed")}</span>;
  if (normalized === "in_progress") return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>{t("status.wo.in_progress")}</span>;
  if (normalized === "cancelled") return <span className={`${base} bg-[var(--surface-2)] border-slate-200 text-[var(--text-secondary)]`}>{t("status.wo.cancelled")}</span>;
  if (normalized === "blocked") return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{t("workOrder.blocked")}</span>;
  return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{t("status.wo.assigned")}</span>;
}

function normalizeQuoteStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (["draft", "szkic"].includes(s)) return "draft";
  if (["submitted", "wysłano", "wyslano"].includes(s)) return "submitted";
  if (["approved", "zatwierdzone", "zatwierdzono"].includes(s)) return "approved";
  if (["rejected", "odrzucone", "odrzucono"].includes(s)) return "rejected";
  return s;
}

function translateQuoteStatus(status, t) {
  const key = normalizeQuoteStatus(status);
  if (key === "draft") return t("workOrders.quoteStatus.draft");
  if (key === "submitted") return t("workOrders.quoteStatus.submitted");
  if (key === "approved") return t("workOrders.quoteStatus.approved");
  if (key === "rejected") return t("workOrders.quoteStatus.rejected");
  return status || "—";
}

export default function ContractorJobDetails() {
  const { id } = useParams();
  const { activeRole, activeAccountId } = useAccount();
  const { t } = useI18n();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);

  const [row, setRow] = useState(null);
  const [fin, setFin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState(getDefaultCurrency());
  const [quoteNotes, setQuoteNotes] = useState("");

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState(getDefaultCurrency());
  const [invoiceIssuedAt, setInvoiceIssuedAt] = useState("");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");
  const [allowedActions, setAllowedActions] = useState([]);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRows, setTimelineRows] = useState([]);
  const [requestRow, setRequestRow] = useState(null);
  const [propertyLabel, setPropertyLabel] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [scheduleInput, setScheduleInput] = useState("");
  const attachmentsRef = useRef(null);
  const financialsRef = useRef(null);
  const timelineRef = useRef(null);

  async function getManagerRecipients() {
    if (!activeAccountId) return [];
    const { data: members, error } = await supabase
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", activeAccountId);
    if (error) throw error;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const actorId = user?.id || null;
    const blockedRoles = new Set(["tenant", "contractor"]);
    return Array.from(
      new Set(
        (members || [])
          .filter((m) => !blockedRoles.has(String(m?.role || "").toLowerCase()))
          .map((m) => m.user_id)
          .filter((uid) => uid && uid !== actorId)
      )
    );
  }

  async function notifyManagers({ type, title, body, metadata = {} }) {
    if (!activeAccountId || !id) return;
    try {
      const recipients = await getManagerRecipients();
      await createNotifications({
        accountId: activeAccountId,
        recipientUserIds: recipients,
        type,
        title,
        body,
        entityType: "work_order",
        entityId: id,
        linkPath: `/work-orders/${id}`,
        metadata: {
          work_order_id: id,
          ...metadata,
        },
      });
    } catch (notifyErr) {
      console.warn("[notifications] work_order_financial notify failed", notifyErr);
    }
  }

  function syncFinInputs(f) {
    setQuoteAmount(f?.quote_amount != null ? String(f.quote_amount) : "");
    setQuoteCurrency(f?.quote_currency || getDefaultCurrency());
    setQuoteNotes(f?.quote_notes || "");

    setInvoiceAmount(f?.invoice_amount != null ? String(f.invoice_amount) : "");
    setInvoiceCurrency(f?.invoice_currency || getDefaultCurrency());

    setInvoiceIssuedAt(toLocal(f?.invoice_issued_at));
    setInvoiceDueAt(toLocal(f?.invoice_due_at));
  }

  function toLocal(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }

  async function loadAll() {
    setLoading(true);
    try {
      const bundle = await getContractorJobDetailsBundle(id, {
        accountId: activeAccountId,
        workOrderId: id,
        source: "ContractorJobDetails",
      });

      setRow(bundle.row ?? null);
      setScheduleInput(toLocal(bundle.row?.scheduled_at));
      setProgressNote("");
      setFin(bundle.financials ?? null);
      syncFinInputs(bundle.financials ?? null);
      setRequestRow(bundle.requestRow ?? null);
      setPropertyLabel(bundle.propertyLabel || "");

      try {
        const acts = await getContractorAllowedActions(id, {
          accountId: bundle.row?.account_id || activeAccountId || null,
          source: "ContractorJobDetails",
        });
        setAllowedActions(acts);
      } catch {
        setAllowedActions([]);
      }
    } catch (e) {
      console.error(e);
      setRow(null);
      setFin(null);
      setAllowedActions([]);
      setRequestRow(null);
      setPropertyLabel("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useRealtimeTables({
    enabled: !!id && isContractor,
    subscriptions: [
      { channel: `contractor-job-work-order:${id}`, table: "work_orders", filter: `id=eq.${id}` },
      { channel: `contractor-job-financials:${id}`, table: "work_order_financials", filter: `work_order_id=eq.${id}` },
      { channel: `contractor-job-requests:${id}`, table: "maintenance_requests" },
      { channel: `contractor-job-properties:${id}`, table: "properties" },
    ],
    onChange: loadAll,
  });

  async function saveQuoteDraft() {
    const amt = Number(quoteAmount);
    if (!Number.isFinite(amt)) {
      alert(t("workOrders.quoteAmountInvalid"));
      return;
    }

    setSaving(true);
    try {
      const data = await upsertQuoteDraft({
        workOrderId: id,
        quoteAmount: amt,
        quoteCurrency: quoteCurrency || getDefaultCurrency(),
        quoteNotes: quoteNotes || null,
      });

      setFin(data ?? null);
      syncFinInputs(data ?? null);
      await notifyManagers({
        type: "work_order_quote_draft_saved",
        title: t("contractor.quoteDraftSavedTitle"),
        body: row?.contractor_name
          ? `${t("common.contractor")}: ${row.contractor_name}`
          : t("contractor.quoteDraftSavedBody"),
      });
    } catch (e) {
      logSecurityRelevantFailure("wo_fin_upsert_quote_draft", {
        error: e,
        context: { workOrderId: id, accountId: activeAccountId },
      });
      alert(e?.message ?? t("workOrders.quoteDraftSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function submitQuote() {
    setSaving(true);
    try {
      const data = await submitWorkOrderQuote({ workOrderId: id });
      setFin(data ?? null);
      syncFinInputs(data ?? null);
      await notifyManagers({
        type: "quote_submitted",
        title: t("contractor.quoteSubmittedTitle"),
        body: row?.contractor_name
          ? `${t("common.contractor")}: ${row.contractor_name}`
          : t("contractor.quoteSubmittedBody"),
        metadata: {
          quote_amount: data?.quote_amount ?? null,
          quote_currency: data?.quote_currency ?? null,
          quote_status: data?.quote_status ?? null,
        },
      });
    } catch (e) {
      logSecurityRelevantFailure("wo_fin_submit_quote", {
        error: e,
        context: { workOrderId: id, accountId: activeAccountId },
      });
      alert(e?.message ?? t("workOrders.quoteSubmitError"));
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoice() {
    const amt = invoiceAmount === "" ? null : Number(invoiceAmount);
    if (amt !== null && !Number.isFinite(amt)) {
      alert(t("workOrders.invoiceAmountInvalid"));
      return;
    }

    setSaving(true);
    try {
      const data = await upsertInvoice({
        workOrderId: id,
        invoiceAmount: amt,
        invoiceCurrency: invoiceCurrency || getDefaultCurrency(),
        invoiceIssuedAt: toIsoOrNullFromLocalInput(invoiceIssuedAt),
        invoiceDueAt: toIsoOrNullFromLocalInput(invoiceDueAt),
      });

      setFin(data ?? null);
      syncFinInputs(data ?? null);
      await notifyManagers({
        type: "work_order_invoice_saved",
        title: t("contractor.invoiceSavedTitle"),
        body: row?.contractor_name
          ? `${t("common.contractor")}: ${row.contractor_name}`
          : t("contractor.invoiceSavedBody"),
      });
    } catch (e) {
      logSecurityRelevantFailure("wo_fin_upsert_invoice", {
        error: e,
        context: { workOrderId: id, accountId: activeAccountId },
      });
      alert(e?.message ?? t("workOrders.invoiceSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(nextStatus) {
    setSaving(true);
    try {
      await updateContractorWorkOrder(
        {
          workOrderId: id,
          status: nextStatus,
          notes: null,
          scheduledAt: null,
        },
        { accountId: activeAccountId },
      );

      if (nextStatus === "in_progress") {
        const { error: ackError } = await supabase
          .from("work_orders")
          .update({
            acknowledged_at: row?.acknowledged_at || new Date().toISOString(),
            acknowledgement_status: "acknowledged",
          })
          .eq("id", id);
        if (ackError && !isMissingAckColumnError(ackError)) throw ackError;
      }

      if (nextStatus === "blocked") {
        await notifyManagers({
          type: "work_order_blocked_follow_up",
          title: t("contractor.blockedFollowupTitle"),
          body: row?.contractor_name
            ? `${t("common.contractor")}: ${row.contractor_name}`
            : t("contractor.blockedFollowupBody"),
          metadata: {
            alert_category: "blocked_follow_up",
            alert_severity: "urgent",
          },
        });

        await recordAutomationExecution({
          accountId: activeAccountId,
          ruleId: "contractor_blocked_followup",
          eventKey: `work_order:${id}:blocked`,
          entityType: "work_order",
          entityId: id,
          title: t("contractor.blockedFollowupTitle"),
          details: {
            property_id: row?.property_id || null,
            contractor_name: row?.contractor_name || null,
          },
        });
      }

      await loadAll();
    } catch (e) {
      logSecurityRelevantFailure("contractor_update_work_order", {
        error: e,
        context: { workOrderId: id, accountId: activeAccountId, requestedStatus: nextStatus },
      });
      alert(e?.message ?? t("workOrders.statusChangeError"));
    } finally {
      setSaving(false);
    }
  }

  async function saveContractorUpdate({ acknowledge = false } = {}) {
    if (!id || !row) return;

    const trimmedNote = String(progressNote || "").trim();
    const timestamp = formatDateTime(new Date().toISOString());
    const noteParts = [];

    if (acknowledge) {
      noteParts.push(`[${timestamp}] ${t("contractor.acknowledgedNote")}`);
    }

    if (trimmedNote) {
      noteParts.push(`[${timestamp}] ${trimmedNote}`);
    }

    if (!noteParts.length && scheduleInput === toLocal(row.scheduled_at)) {
      alert(t("contractor.progressEmpty"));
      return;
    }

    const mergedNotes = noteParts.length
      ? [String(row.notes || "").trim(), ...noteParts].filter(Boolean).join("\n\n")
      : row.notes || null;

    setSaving(true);
    try {
      await updateContractorWorkOrder(
        {
          workOrderId: id,
          status: null,
          notes: mergedNotes,
          scheduledAt: toIsoOrNullFromLocalInput(scheduleInput),
        },
        { accountId: activeAccountId },
      );

      if (acknowledge) {
        const { error: ackError } = await supabase
          .from("work_orders")
          .update({
            acknowledged_at: new Date().toISOString(),
            acknowledgement_status: "acknowledged",
          })
          .eq("id", id);
        if (ackError && !isMissingAckColumnError(ackError)) throw ackError;
      }

      await notifyManagers({
        type: acknowledge ? "work_order_acknowledged" : "work_order_progress_updated",
        title: acknowledge
          ? t("contractor.acknowledgedTitle")
          : t("contractor.progressSavedTitle"),
        body: row?.contractor_name
          ? `${t("common.contractor")}: ${row.contractor_name}`
          : acknowledge
            ? t("contractor.acknowledgedBody")
            : t("contractor.progressSavedBody"),
        metadata: {
          acknowledged: acknowledge,
          scheduled_at: toIsoOrNullFromLocalInput(scheduleInput),
          alert_category: acknowledge ? "contractor" : "maintenance",
          alert_severity: acknowledge ? "info" : "info",
        },
      });

      await loadAll();
    } catch (e) {
      alert(e?.message ?? t("contractor.progressSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function loadTimeline() {
    if (!id) return;
    setTimelineLoading(true);
    try {
      const rows = await listWorkOrderAuditLog(id, { limit: 20 });
      setTimelineRows(rows);
    } catch {
      setTimelineRows([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  useEffect(() => {
    if (!timelineOpen) return;
    loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineOpen, id]);

  if (!isContractor) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-4 pb-24">
      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("contractor.detailsTitle")}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">{t("common.id")}: {id}</p>
            {row ? (
              <div className="mt-2 flex items-center gap-2">
                <StatusPill status={row.status} t={t} />
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={loadAll}
              className="min-h-[44px] text-sm px-3 py-2 rounded-lg border hover:bg-[var(--surface-2)]"
              disabled={loading || saving}
            >
              {t("common.refresh")}
            </button>
            <Link
              to="/contractor"
              className="min-h-[44px] text-center text-sm px-3 py-2 rounded-lg border hover:bg-[var(--surface-2)]"
            >
              {t("common.back")}
            </Link>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !row ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--text-secondary)]">{t("workOrder.notFound")}</p>
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t("contractor.quickActions")}</h3>
              {requestRow?.priority ? (
                <span
                  className={`inline-flex w-fit text-xs px-2 py-0.5 rounded border ${
                    String(requestRow.priority).toLowerCase() === "critical"
                      ? "bg-rose-100 border-rose-300 text-rose-700"
                      : String(requestRow.priority).toLowerCase() === "high"
                        ? "bg-orange-100 border-orange-300 text-orange-700"
                        : "bg-slate-100 border-slate-200 text-[var(--text-secondary)]"
                  }`}
                >
                  {t("common.priority")}: {String(requestRow.priority).toLowerCase() === "critical"
                    ? t("priority.critical")
                    : String(requestRow.priority).toLowerCase() === "high"
                      ? t("priority.high")
                      : t("priority.normal")}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {String(row.status || "").toLowerCase() === "assigned" ? (
                <button
                  type="button"
                  onClick={() => saveContractorUpdate({ acknowledge: true })}
                  disabled={saving}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm text-white ${
                    saving ? "bg-slate-400" : "bg-slate-700"
                  }`}
                >
                  {t("contractor.acknowledgeJob")}
                </button>
              ) : null}
              {allowedActions.includes("in_progress") ? (
                <button
                  type="button"
                  onClick={() => setStatus("in_progress")}
                  disabled={saving}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm text-white ${
                    saving ? "bg-slate-400" : "bg-blue-600"
                  }`}
                >
                  {t("workOrders.startWork")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => attachmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-[var(--surface-2)]"
              >
                {t("attachments.addPhoto")}
              </button>
              <button
                type="button"
                onClick={() => financialsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-[var(--surface-2)]"
              >
                {t("workOrders.addQuote")}
              </button>
              {allowedActions.includes("completed") ? (
                <button
                  type="button"
                  onClick={() => setStatus("completed")}
                  disabled={saving}
                  className={`min-h-[44px] px-3 py-2 rounded-lg text-sm text-white ${
                    saving ? "bg-slate-400" : "bg-green-600"
                  }`}
                >
                  {t("workOrders.completeWork")}
                </button>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            {requestRow?.title ? (
              <div className="text-base font-semibold text-[var(--text-primary)]">{requestRow.title}</div>
            ) : null}
            {propertyLabel ? (
              <div className="text-sm text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">{t("finance.table.property")}:</span> {propertyLabel}
              </div>
            ) : null}
	            <div className="text-sm">
	              <span className="text-[var(--text-muted)]">{t("maintenance.card.status")}:</span>{" "}
	              <StatusPill status={row.status} t={t} />
	            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("common.dueDate")}:</span>{" "}
              <span className="text-[var(--text-primary)]">{formatDateTime(row.scheduled_at)}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("common.contractor")}:</span>{" "}
              <span className="text-[var(--text-primary)]">{row.contractor_name || "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("common.phone")}:</span>{" "}
              <span className="text-[var(--text-primary)]">{row.contractor_phone || "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("contractor.ackStatus")}:</span>{" "}
              <span className="text-[var(--text-primary)]">
                {t(`contractor.ackState.${normalizeAckStatus(row.acknowledgement_status, row.acknowledged_at, row.acknowledgement_due_at)}`)}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("contractor.ackDue")}:</span>{" "}
              <span className="text-[var(--text-primary)]">{formatDateOrDash(row.acknowledgement_due_at)}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("contractor.acknowledgedAt")}:</span>{" "}
              <span className="text-[var(--text-primary)]">{formatDateOrDash(row.acknowledged_at)}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{t("maintenance.drawer.notes")}:</span>{" "}
              <span className="text-[var(--text-primary)]">{row.notes || "—"}</span>
            </div>
            {requestRow?.description ? (
              <div className="text-sm">
                <span className="text-[var(--text-muted)]">{t("common.description")}:</span>{" "}
                <span className="text-[var(--text-primary)]">{requestRow.description}</span>
              </div>
            ) : null}
          </Card>

          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t("contractor.progressTitle")}</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t("contractor.progressSubtitle")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t("contractor.nextVisit")}</label>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t("maintenance.drawer.notes")}</label>
                <textarea
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[110px] disabled:bg-[var(--surface-2)]"
                  placeholder={t("contractor.progressPlaceholder")}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="flex justify-stretch sm:justify-end">
              <button
                type="button"
                onClick={() => saveContractorUpdate({ acknowledge: false })}
                disabled={saving}
                className={`min-h-[44px] w-full px-3 py-2 text-sm rounded-lg text-white sm:w-auto ${
                  saving ? "bg-slate-400" : "bg-blue-600"
                }`}
              >
                {saving ? t("common.saving") : t("contractor.saveProgress")}
              </button>
            </div>
          </Card>

          <Card ref={financialsRef} className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{t("finance.title")}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t("workOrders.financeSubtitle")}
                </p>
              </div>
            </div>

            {!fin ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-[var(--text-secondary)]">{t("workOrders.financeEmpty")}</p>
                <button
                  type="button"
                  onClick={saveQuoteDraft}
                  disabled={saving}
                  className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-blue-600"}`}
                >
                  {saving ? t("common.saving") : t("workOrders.createDraft")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{t("workOrders.quote")}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {t("common.status")}: <span className="font-medium">{translateQuoteStatus(fin.quote_status, t)}</span>
                      {fin.quote_submitted_at ? ` • ${t("workOrders.submittedAt")}: ${formatDateTime(fin.quote_submitted_at)}` : ""}
                      {fin.approved_at ? ` • ${t("workOrders.approvedAt")}: ${formatDateTime(fin.approved_at)}` : ""}
                      {fin.rejected_at ? ` • ${t("workOrders.rejectedAt")}: ${formatDateTime(fin.rejected_at)}` : ""}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-muted)]">{t("payments.amount")}</label>
                      <input
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                        disabled={saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))}
                        placeholder={t("workOrders.amountExample250")}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)]">{t("common.currency")}</label>
                      <select
                        value={quoteCurrency}
                        onChange={(e) => setQuoteCurrency(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                        disabled={saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))}
                      >
                        {getCurrencyOptions().map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)]">{t("attachments.preview")}</label>
                      <div className="mt-1 border rounded-lg px-3 py-2 text-sm bg-[var(--surface-2)] text-[var(--text-secondary)]">
                        {formatMoney(fin.quote_amount, fin.quote_currency)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs text-[var(--text-muted)]">{t("workOrders.quoteNotes")}</label>
                    <textarea
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-[var(--surface-2)]"
                      disabled={saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))}
                      placeholder={t("maintenance.drawer.optional")}
                    />
                  </div>

                  {normalizeQuoteStatus(fin.quote_status) === "rejected" && fin.rejection_reason && (
                    <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                      {t("workOrders.rejected")}: {fin.rejection_reason}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={saveQuoteDraft}
                      disabled={saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))}
                      className={`px-3 py-2 text-sm rounded-lg text-white ${
                        saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))
                          ? "bg-slate-400"
                          : "bg-blue-600"
                      }`}
                    >
                      {saving ? t("common.saving") : t("workOrders.saveDraft")}
                    </button>

                    {["draft", "rejected"].includes(normalizeQuoteStatus(fin.quote_status)) && (
                      <button
                        type="button"
                        onClick={submitQuote}
                        disabled={saving}
                        className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-slate-900"}`}
                      >
                        {t("workOrders.submitQuote")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{t("workOrders.invoice")}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {fin.invoice_amount != null
                        ? `${t("workOrders.amount")}: ${formatMoney(fin.invoice_amount, fin.invoice_currency)}`
                        : t("workOrders.noAmount")}
                    </div>
                  </div>

                  {normalizeQuoteStatus(fin.quote_status) !== "approved" ? (
                    <p className="text-sm text-[var(--text-secondary)] mt-3">
                      {t("workOrders.invoiceAfterApprovalOnly")}
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-muted)]">{t("workOrders.invoiceAmount")}</label>
                          <input
                            value={invoiceAmount}
                            onChange={(e) => setInvoiceAmount(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                            disabled={saving}
                            placeholder={t("workOrders.amountExample300")}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-[var(--text-muted)]">{t("common.currency")}</label>
                          <select
                            value={invoiceCurrency}
                            onChange={(e) => setInvoiceCurrency(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                            disabled={saving}
                          >
                            {getCurrencyOptions().map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-[var(--text-muted)]">{t("workOrders.invoiceIssuedAt")}</label>
                          <input
                            type="datetime-local"
                            value={invoiceIssuedAt}
                            onChange={(e) => setInvoiceIssuedAt(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                            disabled={saving}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-[var(--text-muted)]">{t("workOrders.invoiceDueAt")}</label>
                          <input
                            type="datetime-local"
                            value={invoiceDueAt}
                            onChange={(e) => setInvoiceDueAt(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-[var(--surface-2)]"
                            disabled={saving}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={saveInvoice}
                          disabled={saving}
                          className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-blue-600"}`}
                        >
                          {saving ? t("common.saving") : t("workOrders.saveInvoice")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>

          <div ref={attachmentsRef}>
            <ContractorAttachmentsPanel
              accountId={activeAccountId}
              workOrderId={id}
              canUpload={isContractor}
            />
          </div>

          {row.maintenance_request_id ? (
            <MaintenanceRequestAttachmentsPanel
              accountId={activeAccountId}
              maintenanceRequestId={row.maintenance_request_id}
              canUpload={false}
              allowDelete={false}
            />
          ) : null}

          <Card ref={timelineRef} className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t("common.timeline")}</h3>
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                className="px-3 py-1.5 text-xs rounded-lg border hover:bg-[var(--surface-2)]"
              >
                {timelineOpen ? t("common.hide") : t("common.show")}
              </button>
            </div>
            {timelineOpen ? (
              timelineLoading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : timelineRows.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">{t("workOrder.noEntries")}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {timelineRows.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2">
                      <p className="text-sm text-[var(--text-primary)]">{entry.action || "update"}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDateTime(entry.created_at)}</p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">{t("contractor.timelineCollapsed")}</p>
            )}
          </Card>
        </>
      )}

      {!loading && row ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-soft)] bg-[var(--surface-1)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-1)]/80 md:hidden">
          <div className="max-w-5xl mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-2 overflow-x-auto">
            {allowedActions.includes("in_progress") ? (
              <button
                type="button"
                onClick={() => setStatus("in_progress")}
                disabled={saving}
                className={`whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm text-white ${
                  saving ? "bg-slate-400" : "bg-blue-600"
                }`}
              >
                {t("workOrders.startWork")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => attachmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-[var(--surface-2)]"
            >
              {t("attachments.addPhoto")}
            </button>
            <button
              type="button"
              onClick={() => financialsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-[var(--surface-2)]"
            >
              {t("workOrders.addQuote")}
            </button>
            {allowedActions.includes("completed") ? (
              <button
                type="button"
                onClick={() => setStatus("completed")}
                disabled={saving}
                className={`whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm text-white ${
                  saving ? "bg-slate-400" : "bg-green-600"
                }`}
                >
                {t("workOrders.completeWork")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-[var(--surface-2)]"
            >
              {t("common.timeline")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
