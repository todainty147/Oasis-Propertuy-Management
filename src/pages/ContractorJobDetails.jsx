import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import ContractorAttachmentsPanel from "../components/work-orders/ContractorAttachmentsPanel";
import MaintenanceRequestAttachmentsPanel from "../components/maintenance/MaintenanceRequestAttachmentsPanel";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { createNotifications } from "../services/notificationService";
import { useI18n } from "../context/I18nContext";

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatMoney(val, currency = "PLN") {
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} ${currency || "PLN"}`;
}

function toIsoOrNullFromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function StatusPill({ status, t }) {
  const s = String(status || "").trim().toLowerCase();
  const normalized =
    ["przypisane"].includes(s) ? "assigned" :
    ["w trakcie", "in progress"].includes(s) ? "in_progress" :
    ["zakończone", "zakonczone"].includes(s) ? "completed" :
    ["anulowane"].includes(s) ? "cancelled" :
    ["zablokowane"].includes(s) ? "blocked" :
    s;
  const base = "text-xs px-2 py-0.5 rounded-full border";
  if (normalized === "completed") return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>{t("status.wo.completed")}</span>;
  if (normalized === "in_progress") return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>{t("status.wo.in_progress")}</span>;
  if (normalized === "cancelled") return <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>{t("status.wo.cancelled")}</span>;
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
  const [quoteCurrency, setQuoteCurrency] = useState("PLN");
  const [quoteNotes, setQuoteNotes] = useState("");

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState("PLN");
  const [invoiceIssuedAt, setInvoiceIssuedAt] = useState("");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");
  const [allowedActions, setAllowedActions] = useState([]);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRows, setTimelineRows] = useState([]);
  const [requestRow, setRequestRow] = useState(null);
  const [propertyLabel, setPropertyLabel] = useState("");
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
    setQuoteCurrency(f?.quote_currency || "PLN");
    setQuoteNotes(f?.quote_notes || "");

    setInvoiceAmount(f?.invoice_amount != null ? String(f.invoice_amount) : "");
    setInvoiceCurrency(f?.invoice_currency || "PLN");

    const toLocal = (ts) => {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    };

    setInvoiceIssuedAt(toLocal(f?.invoice_issued_at));
    setInvoiceDueAt(toLocal(f?.invoice_due_at));
  }

  async function loadAll() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select(
          "id, maintenance_request_id, property_id, status, scheduled_at, notes, contractor_name, contractor_phone, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      setRow(data ?? null);

      // Financials: may not exist yet
      const { data: f, error: fe } = await supabase
        .from("work_order_financials")
        .select(
          "id, account_id, work_order_id, quote_amount, quote_currency, quote_notes, quote_status, quote_submitted_at, quote_submitted_by, invoice_amount, invoice_currency, invoice_issued_at, invoice_due_at, approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at, updated_at"
        )
        .eq("work_order_id", id)
        .maybeSingle();

      if (!fe) {
        setFin(f ?? null);
        syncFinInputs(f ?? null);
      } else {
        setFin(null);
      }

      let resolvedRequest = null;
      let resolvedPropertyLabel = "";

      if (data?.maintenance_request_id) {
        const { data: req } = await supabase
          .from("maintenance_requests")
          .select("id, title, description, priority, property_id")
          .eq("id", data.maintenance_request_id)
          .maybeSingle();
        resolvedRequest = req || null;
        setRequestRow(resolvedRequest);

        const propertyId = req?.property_id || data?.property_id;
        if (propertyId) {
          const { data: prop } = await supabase
            .from("properties")
            .select("id, address, city")
            .eq("id", propertyId)
            .maybeSingle();
          if (prop) {
            resolvedPropertyLabel = `${prop.address || t("common.property")}${prop.city ? `, ${prop.city}` : ""}`;
            setPropertyLabel(resolvedPropertyLabel);
          } else {
            setPropertyLabel("");
          }
        } else {
          setPropertyLabel("");
        }
      } else {
        setRequestRow(null);
        setPropertyLabel("");
      }

      if ((!resolvedPropertyLabel || !resolvedRequest?.title) && data?.id) {
        try {
          const { data: cardRows, error: cardErr } = await supabase.rpc("contractor_work_order_cards", {
            p_work_order_ids: [data.id],
          });
          if (!cardErr && Array.isArray(cardRows) && cardRows[0]) {
            const c = cardRows[0];
            if (!String(resolvedPropertyLabel || "").trim() && String(c.property_label || "").trim()) {
              setPropertyLabel(String(c.property_label).trim());
            }
            setRequestRow((prev) => ({
              ...(prev || {}),
              id: prev?.id || data?.maintenance_request_id || null,
              title: String(prev?.title || "").trim() || String(c.issue_title || "").trim() || prev?.title || "",
              description:
                String(prev?.description || "").trim() ||
                String(c.issue_description || "").trim() ||
                prev?.description ||
                "",
              priority:
                String(prev?.priority || "").trim() ||
                String(c.issue_priority || "").trim() ||
                prev?.priority ||
                "normal",
            }));
          }
        } catch {
          // Optional fallback RPC; ignore if not deployed yet.
        }
      }

      const { data: acts, error: aErr } = await supabase.rpc("contractor_allowed_actions", {
        p_work_order_id: id,
      });
      if (!aErr) setAllowedActions(Array.isArray(acts) ? acts : []);
      else setAllowedActions([]);
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
    let alive = true;
    (async () => {
      if (!alive) return;
      await loadAll();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveQuoteDraft() {
    const amt = Number(quoteAmount);
    if (!Number.isFinite(amt)) {
      alert(t("workOrders.quoteAmountInvalid"));
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("wo_fin_upsert_quote_draft", {
        p_work_order_id: id,
        p_quote_amount: amt,
        p_quote_currency: quoteCurrency || "PLN",
        p_quote_notes: quoteNotes || null,
      });
      if (error) throw error;

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
      alert(e?.message ?? t("workOrders.quoteDraftSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function submitQuote() {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("wo_fin_submit_quote", {
        p_work_order_id: id,
      });
      if (error) throw error;
      setFin(data ?? null);
      syncFinInputs(data ?? null);
    } catch (e) {
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
      const { data, error } = await supabase.rpc("wo_fin_upsert_invoice", {
        p_work_order_id: id,
        p_invoice_amount: amt,
        p_invoice_currency: invoiceCurrency || "PLN",
        p_invoice_issued_at: toIsoOrNullFromLocalInput(invoiceIssuedAt),
        p_invoice_due_at: toIsoOrNullFromLocalInput(invoiceDueAt),
      });
      if (error) throw error;

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
      alert(e?.message ?? t("workOrders.invoiceSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(nextStatus) {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("contractor_update_work_order", {
        p_work_order_id: id,
        p_status: nextStatus,
        p_notes: null,
        p_scheduled_at: null,
      });
      if (error) throw error;
      await loadAll();
    } catch (e) {
      alert(e?.message ?? t("workOrders.statusChangeError"));
    } finally {
      setSaving(false);
    }
  }

  async function loadTimeline() {
    if (!id) return;
    setTimelineLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_order_audit_log")
        .select("id, action, old_value, new_value, created_at")
        .eq("work_order_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setTimelineRows(data || []);
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
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">
          {t("contractor.onlyAccess")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("contractor.detailsTitle")}</h2>
            <p className="text-xs text-slate-500 mt-1">{t("common.id")}: {id}</p>
            {row ? (
              <div className="mt-2 flex items-center gap-2">
                <StatusPill status={row.status} t={t} />
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadAll}
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
              disabled={loading || saving}
            >
              {t("common.refresh")}
            </button>
            <Link
              to="/contractor"
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
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
          <p className="text-sm text-slate-600">{t("workOrder.notFound")}</p>
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{t("contractor.quickActions")}</h3>
              {requestRow?.priority ? (
                <span
                  className={`text-xs px-2 py-0.5 rounded border ${
                    String(requestRow.priority).toLowerCase() === "critical"
                      ? "bg-rose-100 border-rose-300 text-rose-700"
                      : String(requestRow.priority).toLowerCase() === "high"
                        ? "bg-orange-100 border-orange-300 text-orange-700"
                        : "bg-slate-100 border-slate-200 text-slate-700"
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
                className="min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-slate-50"
              >
                {t("attachments.addPhoto")}
              </button>
              <button
                type="button"
                onClick={() => financialsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-slate-50"
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
              <div className="text-base font-semibold text-slate-900">{requestRow.title}</div>
            ) : null}
            {propertyLabel ? (
              <div className="text-sm text-slate-700">
                <span className="text-slate-500">{t("finance.table.property")}:</span> {propertyLabel}
              </div>
            ) : null}
            <div className="text-sm">
              <span className="text-slate-500">{t("maintenance.card.status")}:</span>{" "}
              <span className="font-medium text-slate-900">{row.status}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">{t("common.dueDate")}:</span>{" "}
              <span className="text-slate-900">{formatDateTime(row.scheduled_at)}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">{t("common.contractor")}:</span>{" "}
              <span className="text-slate-900">{row.contractor_name || "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">{t("common.phone")}:</span>{" "}
              <span className="text-slate-900">{row.contractor_phone || "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">{t("maintenance.drawer.notes")}:</span>{" "}
              <span className="text-slate-900">{row.notes || "—"}</span>
            </div>
            {requestRow?.description ? (
              <div className="text-sm">
                <span className="text-slate-500">{t("common.description")}:</span>{" "}
                <span className="text-slate-900">{requestRow.description}</span>
              </div>
            ) : null}
          </Card>

          <Card ref={financialsRef} className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{t("finance.title")}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {t("workOrders.financeSubtitle")}
                </p>
              </div>
            </div>

            {!fin ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">{t("workOrders.financeEmpty")}</p>
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
                    <div className="text-sm font-semibold text-slate-900">{t("workOrders.quote")}</div>
                    <div className="text-xs text-slate-500">
                      {t("common.status")}: <span className="font-medium">{translateQuoteStatus(fin.quote_status, t)}</span>
                      {fin.quote_submitted_at ? ` • ${t("workOrders.submittedAt")}: ${formatDateTime(fin.quote_submitted_at)}` : ""}
                      {fin.approved_at ? ` • ${t("workOrders.approvedAt")}: ${formatDateTime(fin.approved_at)}` : ""}
                      {fin.rejected_at ? ` • ${t("workOrders.rejectedAt")}: ${formatDateTime(fin.rejected_at)}` : ""}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">{t("payments.amount")}</label>
                      <input
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                        disabled={saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))}
                        placeholder={t("workOrders.amountExample250")}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">{t("common.currency")}</label>
                      <select
                        value={quoteCurrency}
                        onChange={(e) => setQuoteCurrency(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                        disabled={saving || ["submitted", "approved"].includes(normalizeQuoteStatus(fin.quote_status))}
                      >
                        {["PLN", "GBP", "EUR", "USD"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">{t("attachments.preview")}</label>
                      <div className="mt-1 border rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
                        {formatMoney(fin.quote_amount, fin.quote_currency)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs text-slate-500">{t("workOrders.quoteNotes")}</label>
                    <textarea
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-slate-50"
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
                    <div className="text-sm font-semibold text-slate-900">{t("workOrders.invoice")}</div>
                    <div className="text-xs text-slate-500">
                      {fin.invoice_amount != null
                        ? `${t("workOrders.amount")}: ${formatMoney(fin.invoice_amount, fin.invoice_currency)}`
                        : t("workOrders.noAmount")}
                    </div>
                  </div>

                  {normalizeQuoteStatus(fin.quote_status) !== "approved" ? (
                    <p className="text-sm text-slate-600 mt-3">
                      {t("workOrders.invoiceAfterApprovalOnly")}
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500">{t("workOrders.invoiceAmount")}</label>
                          <input
                            value={invoiceAmount}
                            onChange={(e) => setInvoiceAmount(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                            placeholder={t("workOrders.amountExample300")}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-500">{t("common.currency")}</label>
                          <select
                            value={invoiceCurrency}
                            onChange={(e) => setInvoiceCurrency(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                          >
                            {["PLN", "GBP", "EUR", "USD"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-slate-500">{t("workOrders.invoiceIssuedAt")}</label>
                          <input
                            type="datetime-local"
                            value={invoiceIssuedAt}
                            onChange={(e) => setInvoiceIssuedAt(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-500">{t("workOrders.invoiceDueAt")}</label>
                          <input
                            type="datetime-local"
                            value={invoiceDueAt}
                            onChange={(e) => setInvoiceDueAt(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
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
              <h3 className="text-base font-semibold text-slate-900">{t("common.timeline")}</h3>
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                className="px-3 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
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
                <p className="mt-3 text-sm text-slate-500">{t("workOrder.noEntries")}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {timelineRows.map((t) => (
                    <div key={t.id} className="rounded-lg border border-slate-200 px-3 py-2">
                      <p className="text-sm text-slate-900">{t.action || "update"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(t.created_at)}</p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t("contractor.timelineCollapsed")}</p>
            )}
          </Card>
        </>
      )}

      {!loading && row ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:hidden">
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
              className="whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-slate-50"
            >
              {t("attachments.addPhoto")}
            </button>
            <button
              type="button"
              onClick={() => financialsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-slate-50"
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
              className="whitespace-nowrap min-h-[44px] px-3 py-2 rounded-lg text-sm border hover:bg-slate-50"
            >
              {t("common.timeline")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
