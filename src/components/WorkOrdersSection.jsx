// src/components/WorkOrdersSection.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import ContractorAttachmentsPanel from "./work-orders/ContractorAttachmentsPanel";
import { useAccount } from "../context/AccountContext";
import { createWorkOrder, deleteWorkOrder } from "../services/workOrderService";
import { supabase } from "../lib/supabase";
import {
  listWorkOrderAttachments,
  uploadWorkOrderAttachments,
  createAttachmentSignedUrl,
  deleteWorkOrderAttachment,
  BUCKET as ATTACHMENTS_BUCKET,
} from "../services/workOrderAttachmentsService";
import {
  getWorkOrderFinancials,
  upsertQuoteDraft,
  submitQuote,
  approveQuote,
  rejectQuote,
  upsertInvoice,
} from "../services/workOrderFinancialsService";
import { getContractorRatingByWorkOrder, upsertContractorRating } from "../services/contractorRatingService";
import { useI18n } from "../context/I18nContext";
/* -----------------------------
   UI helpers
----------------------------- */

function formatDateTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatMoney(val, currency = "PLN") {
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} ${currency || "PLN"}`;
}

function isRatingsUnavailableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("could not find the table 'public.contractor_ratings'") ||
    msg.includes('relation "contractor_ratings" does not exist') ||
    msg.includes("missing contractor_ratings table")
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[95vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded hover:bg-slate-100"
          >
            Zamknij
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function PaginationFooter({ page, totalPages, totalCount, pageSize, onPrev, onNext, onPageSizeChange, t }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white"
        >
          {[10, 20, 30, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between md:justify-end gap-3">
        <button
          className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
          onClick={onPrev}
          disabled={page <= 1}
        >
          {t("common.prev")}
        </button>

        <div className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          {typeof totalCount === "number" ? (
            <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
          ) : null}
        </div>

        <button
          className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

/* -----------------------------
   Component
----------------------------- */

export default function WorkOrdersSection({ propertyId }) {
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();

  // ✅ NEXT-4: allow deep-link from Maintenance Requests list
  const [searchParams, setSearchParams] = useSearchParams();
  const createWOFromUrl = searchParams.get("createWO") === "1";
  const mrIdFromUrl = searchParams.get("mrId") || "";
  const seedNotesFromUrl = searchParams.get("seedNotes") === "1";

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);
  const isTenant = useMemo(() => role === "tenant", [role]);

  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  // ✅ per-row busy state (prevents double-click + shows feedback)
  const [actionBusyId, setActionBusyId] = useState(null);

  // -----------------------------
  // Work orders state (from view)
  // -----------------------------
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ✅ Pagination (V1) + page-size selector
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 1))), [
    totalCount,
    pageSize,
  ]);

  // Keep page in bounds after deletes / data changes
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // Reset to page 1 when changing property/account
  useEffect(() => {
    setPage(1);
  }, [activeAccountId, propertyId]);

  // -----------------------------
  // Modal + Audit timeline
  // -----------------------------
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState(null);

  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ------------------------------
  // Allowed actions cache (performance)
  // ------------------------------
  const [allowedActionsById, setAllowedActionsById] = useState({});

  // ------------------------------
  // Status labels (Polish) from DB
  // ------------------------------
  const [statusLabelByKey, setStatusLabelByKey] = useState({});
  const statusLabelsLoadedRef = useRef(false);

  function getStatusLabel(status) {
    const s = String(status ?? "").toLowerCase();
    return statusLabelByKey?.[s] || null;
  }

  function StatusPill({ status }) {
    const base = "text-xs px-2 py-0.5 rounded border";
    const s = String(status ?? "").toLowerCase();
    const label = getStatusLabel(s) || status || "assigned";

    if (s === "completed")
      return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>{label}</span>;

    if (s === "in_progress")
      return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>{label}</span>;

    if (s === "cancelled")
      return <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>{label}</span>;

    return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{label}</span>;
  }

  // -----------------------------
  // Mounted guard
  // -----------------------------
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function loadAllowedActionsForRows(rows) {
    if (!canManage) {
      setAllowedActionsById({});
      return;
    }

    try {
      const ids = (rows ?? []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) {
        setAllowedActionsById({});
        return;
      }

      const { data, error } = await supabase.rpc("work_order_allowed_actions_bulk", {
        p_work_order_ids: ids,
      });

      if (error) throw error;

      const map = {};
      for (const r of data ?? []) map[r.work_order_id] = r.actions ?? [];
      if (mountedRef.current) setAllowedActionsById(map);
    } catch {
      if (mountedRef.current) setAllowedActionsById({});
    }
  }

  async function ensureAllowedActionsLoaded(workOrderId) {
    if (!canManage) return;
    if (!workOrderId) return;
    if (allowedActionsById?.[workOrderId]) return;

    try {
      const { data, error } = await supabase.rpc("work_order_allowed_actions", {
        p_work_order_id: workOrderId,
      });
      if (error) throw error;

      const actions = Array.isArray(data) ? data : [];
      if (mountedRef.current) {
        setAllowedActionsById((prev) => ({
          ...(prev || {}),
          [workOrderId]: actions,
        }));
      }
    } catch {
      // ignore
    }
  }

  async function loadAudit(workOrderId) {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_order_audit_log")
        .select("id, action, actor_user_id, old_value, new_value, created_at")
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (mountedRef.current) setAudit(data ?? []);
    } catch {
      if (mountedRef.current) setAudit([]);
    } finally {
      if (mountedRef.current) setAuditLoading(false);
    }
  }

  // -----------------------------------------
  // A4: Attachments
  // -----------------------------------------
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [signedUrlByPath, setSignedUrlByPath] = useState({}); // storage_path -> signedUrl

  async function loadAttachments(workOrderId) {
    if (!activeAccountId || !workOrderId) return;
    setAttachmentsLoading(true);

    try {
      const rows = await listWorkOrderAttachments({ accountId: activeAccountId, workOrderId });
      if (!mountedRef.current) return;

      setAttachments(rows);

      const nextMap = {};
      for (const a of rows ?? []) {
        const isImage = String(a?.mime_type || "").startsWith("image/");
        if (!isImage) continue;
        try {
          const bucket = a.storage_bucket || ATTACHMENTS_BUCKET;
          const url = await createAttachmentSignedUrl(bucket, a.storage_path, 120);
          if (url) nextMap[a.storage_path] = url;
        } catch {
          // ignore per-item
        }
      }

      if (mountedRef.current) setSignedUrlByPath(nextMap);
    } catch {
      if (mountedRef.current) {
        setAttachments([]);
        setSignedUrlByPath({});
      }
    } finally {
      if (mountedRef.current) setAttachmentsLoading(false);
    }
  }

  async function handleUploadAttachments(workOrderId, files) {
    if (!activeAccountId || !workOrderId) return;
    if (!files || files.length === 0) return;

    setAttachmentsUploading(true);
    try {
      await uploadWorkOrderAttachments({
        accountId: activeAccountId,
        workOrderId,
        files,
      });

      await loadAttachments(workOrderId);
    } catch (e) {
      alert(e?.message ?? t("attachments.uploadError"));
    } finally {
      setAttachmentsUploading(false);
    }
  }

  async function handleDownloadAttachment(a) {
    try {
      const bucket = a.storage_bucket || ATTACHMENTS_BUCKET;
      const url = await createAttachmentSignedUrl(bucket, a.storage_path, 60);
      if (!url) throw new Error("Brak linku");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e?.message ?? t("attachments.downloadError"));
    }
  }

  async function handleDeleteAttachment(a) {
    if (!confirm(t("attachments.confirmDeleteGeneric"))) return;
    try {
      await deleteWorkOrderAttachment({
        attachmentId: a.id,
        attachmentRow: a,
      });
      await loadAttachments(a.work_order_id);
    } catch (e) {
      alert(e?.message ?? t("attachments.deleteError"));
    }
  }

  // -----------------------------------------
  // B3: Financials (RPC-only writes)
  // -----------------------------------------
  const [financials, setFinancials] = useState(null);
  const [finLoading, setFinLoading] = useState(false);
  const [finSaving, setFinSaving] = useState(false);

  // editable fields (draft + invoice details)
  const [finQuoteAmount, setFinQuoteAmount] = useState("");
  const [finQuoteCurrency, setFinQuoteCurrency] = useState("PLN");
  const [finQuoteNotes, setFinQuoteNotes] = useState("");
  const [finRejectReason, setFinRejectReason] = useState("");

  const [finInvoiceAmount, setFinInvoiceAmount] = useState("");
  const [finInvoiceCurrency, setFinInvoiceCurrency] = useState("PLN");
  const [finInvoiceIssuedAt, setFinInvoiceIssuedAt] = useState("");
  const [finInvoiceDueAt, setFinInvoiceDueAt] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingUnavailable, setRatingUnavailable] = useState(false);
  const [ratingRow, setRatingRow] = useState(null);
  const [ratingValue, setRatingValue] = useState("");
  const [ratingComment, setRatingComment] = useState("");

  function syncFinInputs(row) {
    const qAmt = row?.quote_amount;
    const iAmt = row?.invoice_amount;

    setFinQuoteAmount(typeof qAmt === "number" || typeof qAmt === "string" ? String(qAmt) : "");
    setFinQuoteCurrency(row?.quote_currency || "PLN");
    setFinQuoteNotes(row?.quote_notes || "");

    setFinInvoiceAmount(typeof iAmt === "number" || typeof iAmt === "string" ? String(iAmt) : "");
    setFinInvoiceCurrency(row?.invoice_currency || "PLN");

    // datetime-local expects "YYYY-MM-DDTHH:mm"
    const toLocalInput = (ts) => {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    };

    setFinInvoiceIssuedAt(toLocalInput(row?.invoice_issued_at));
    setFinInvoiceDueAt(toLocalInput(row?.invoice_due_at));
    setFinRejectReason(row?.rejection_reason || "");
  }

  async function loadFinancials(workOrderId) {
    if (!activeAccountId || !workOrderId) return;

    setFinLoading(true);
    try {
      const row = await getWorkOrderFinancials({ accountId: activeAccountId, workOrderId });
      if (!mountedRef.current) return;
      setFinancials(row);
      syncFinInputs(row);
    } catch {
      if (mountedRef.current) {
        setFinancials(null);
      }
    } finally {
      if (mountedRef.current) setFinLoading(false);
    }
  }

  async function finCreateOrSaveDraft(workOrderId) {
    const n = Number(finQuoteAmount);
    if (!Number.isFinite(n)) {
      alert(t("workOrders.quoteAmountInvalid"));
      return;
    }

    setFinSaving(true);
    try {
      await upsertQuoteDraft({
        workOrderId,
        quoteAmount: n,
        quoteCurrency: finQuoteCurrency || "PLN",
        quoteNotes: finQuoteNotes || null,
      });

      await loadFinancials(workOrderId);
    } catch (e) {
      alert(e?.message ?? t("workOrders.quoteDraftSaveError"));
    } finally {
      setFinSaving(false);
    }
  }

  async function finSubmit(workOrderId) {
    setFinSaving(true);
    try {
      const { error } = await supabase.rpc("wo_fin_submit_quote", {
        p_work_order_id: workOrderId,
      });
      if (error) throw error;

      await loadFinancials(workOrderId);
    } catch (e) {
      alert(e?.message ?? t("workOrders.quoteSubmitError"));
    } finally {
      setFinSaving(false);
    }
  }

  async function finApprove(workOrderId) {
    if (!canManage) return;

    setFinSaving(true);
    try {
      const { error } = await supabase.rpc("wo_fin_approve_quote", {
        p_work_order_id: workOrderId,
      });
      if (error) throw error;

      await loadFinancials(workOrderId);
    } catch (e) {
      alert(e?.message ?? t("workOrders.quoteApproveError"));
    } finally {
      setFinSaving(false);
    }
  }

  async function finReject(workOrderId) {
    if (!canManage) return;

    setFinSaving(true);
    try {
      await rejectQuote({ workOrderId, reason: finRejectReason || null });
      await loadFinancials(workOrderId);
    } catch (e) {
      alert(e?.message ?? t("workOrders.quoteRejectError"));
    } finally {
      setFinSaving(false);
    }
  }

  async function finSaveInvoice(workOrderId) {
    if (!isContractor) return;

    const amt = finInvoiceAmount === "" ? null : Number(finInvoiceAmount);
    if (amt !== null && !Number.isFinite(amt)) {
      alert(t("workOrders.invoiceAmountInvalid"));
      return;
    }

    const toIsoOrNull = (v) => (v ? new Date(v).toISOString() : null);

    setFinSaving(true);
    try {
      await upsertInvoice({
        workOrderId,
        invoiceAmount: amt,
        invoiceCurrency: finInvoiceCurrency || "PLN",
        invoiceIssuedAt: toIsoOrNull(finInvoiceIssuedAt),
        invoiceDueAt: toIsoOrNull(finInvoiceDueAt),
      });

      await loadFinancials(workOrderId);
    } catch (e) {
      alert(e?.message ?? t("workOrders.invoiceSaveError"));
    } finally {
      setFinSaving(false);
    }
  }

  async function loadContractorRating(workOrderId) {
    if (!canManage || !workOrderId) return;
    setRatingLoading(true);
    setRatingUnavailable(false);
    try {
      const row = await getContractorRatingByWorkOrder(workOrderId);
      if (!mountedRef.current) return;
      setRatingRow(row);
      setRatingValue(row?.rating != null ? String(row.rating) : "");
      setRatingComment(row?.comment || "");
    } catch (e) {
      if (!mountedRef.current) return;
      if (isRatingsUnavailableError(e)) {
        setRatingUnavailable(true);
        return;
      }
      if (!mountedRef.current) return;
      setRatingRow(null);
      setRatingValue("");
      setRatingComment("");
    } finally {
      if (mountedRef.current) setRatingLoading(false);
    }
  }

  async function saveContractorRating(workOrderId) {
    if (!canManage || !workOrderId) return;
    if (ratingUnavailable) return;
    if (!ratingValue) {
      alert(t("ratings.pickValue"));
      return;
    }
    setRatingSaving(true);
    try {
      const row = await upsertContractorRating({
        accountId: activeAccountId,
        workOrderId,
        contractorUserId: selectedWO?.contractor_user_id || null,
        rating: Number(ratingValue),
        comment: ratingComment || null,
      });
      if (!mountedRef.current) return;
      setRatingRow(row);
      alert(t("ratings.saved"));
    } catch (e) {
      if (isRatingsUnavailableError(e)) {
        if (mountedRef.current) setRatingUnavailable(true);
        alert(t("ratings.unavailable"));
        return;
      }
      alert(e?.message ?? t("ratings.saveError"));
    } finally {
      if (mountedRef.current) setRatingSaving(false);
    }
  }

  // -----------------------------------------
  // Contractors directory (manager-only)
  // -----------------------------------------
  const [contractors, setContractors] = useState([]);
  const [contractorsLoading, setContractorsLoading] = useState(false);

  async function loadContractors() {
    if (!activeAccountId || !canManage) {
      setContractors([]);
      return;
    }

    setContractorsLoading(true);
    try {
      const { data, error } = await supabase
        .from("contractors")
        .select("id, name, phone, email, user_id, active")
        .eq("account_id", activeAccountId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      if (mountedRef.current) setContractors(data ?? []);
    } catch {
      if (mountedRef.current) setContractors([]);
    } finally {
      if (mountedRef.current) setContractorsLoading(false);
    }
  }

  function openDetails(wo) {
    setSelectedWO(wo);
    setDetailOpen(true);
    loadAudit(wo.id);
    ensureAllowedActionsLoaded(wo.id);

    // ✅ A4
    loadAttachments(wo.id);

    // ✅ B3
    loadFinancials(wo.id);
    loadContractorRating(wo.id);
  }

  function closeDetails() {
    setDetailOpen(false);
    setSelectedWO(null);
    setAudit([]);
    setAssignContractorId("");

    // ✅ A4
    setAttachments([]);
    setSignedUrlByPath({});

    // ✅ B3
    setFinancials(null);
    setFinQuoteAmount("");
    setFinQuoteCurrency("PLN");
    setFinQuoteNotes("");
    setFinRejectReason("");
    setFinInvoiceAmount("");
    setFinInvoiceCurrency("PLN");
    setFinInvoiceIssuedAt("");
    setFinInvoiceDueAt("");
    setRatingUnavailable(false);
    setRatingRow(null);
    setRatingValue("");
    setRatingComment("");
  }

  async function reload() {
    if (!activeAccountId || !propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from("work_orders_with_flags")
        .select(
          `
          id,
          account_id,
          property_id,
          maintenance_request_id,
          contractor_user_id,
          contractor_name,
          contractor_phone,
          status,
          scheduled_at,
          notes,
          quote_amount,
          invoice_amount,
          created_by,
          created_at,
          updated_at,
          pending_cancel_request,
          last_cancel_request_at,
          last_cancel_request_by,
          last_cancel_resolution_at,
          last_cancel_resolution_action,
          last_cancel_resolution_by,
          maintenance_requests:maintenance_request_id ( id, title, status, priority )
        `,
          { count: "exact" }
        )
        .eq("account_id", activeAccountId)
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = data ?? [];
      if (mountedRef.current) {
        setWorkOrders(rows);
        setTotalCount(count ?? 0);
      }

      await loadAllowedActionsForRows(rows);

      if (detailOpen && selectedWO?.id) {
        const refreshed = rows.find((r) => r.id === selectedWO.id);
        if (refreshed && mountedRef.current) setSelectedWO(refreshed);
      }
    } catch (e) {
      if (mountedRef.current) {
        setWorkOrders([]);
        setTotalCount(0);
        setError(e);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // -----------------------------------------
  // Pending cancellation inbox
  // -----------------------------------------
  const [pendingInbox, setPendingInbox] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  async function loadPendingInbox() {
    if (!activeAccountId || !canManage) return;
    setPendingLoading(true);

    try {
      let q = supabase
        .from("work_orders_pending_cancellation")
        .select(
          `
          id,
          account_id,
          property_id,
          status,
          contractor_name,
          contractor_phone,
          scheduled_at,
          last_cancel_request_at,
          last_cancel_request_by
        `
        )
        .eq("account_id", activeAccountId)
        .order("last_cancel_request_at", { ascending: false })
        .limit(20);

      if (propertyId) q = q.eq("property_id", propertyId);

      const { data, error } = await q;
      if (error) throw error;

      if (mountedRef.current) setPendingInbox(data ?? []);
    } catch {
      if (mountedRef.current) setPendingInbox([]);
    } finally {
      if (mountedRef.current) setPendingLoading(false);
    }
  }

  // -----------------------------------------
  // Load status defs once
  // -----------------------------------------
  useEffect(() => {
    if (statusLabelsLoadedRef.current) return;

    let cancelled = false;

    async function loadStatusDefs() {
      try {
        const { data, error } = await supabase
          .from("work_order_status_definitions")
          .select("status,label");

        if (error) throw error;

        if (cancelled || !mountedRef.current) return;

        const map = {};
        for (const r of data ?? []) {
          const key = String(r.status ?? "").toLowerCase();
          if (key) map[key] = r.label ?? r.status;
        }
        setStatusLabelByKey(map);
        statusLabelsLoadedRef.current = true;
      } catch {
        statusLabelsLoadedRef.current = true;
      }
    }

    loadStatusDefs();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ Reload work orders when page/pageSize changes
  useEffect(() => {
    if (!activeAccountId || !propertyId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, propertyId, page, pageSize]);

  // ✅ Load manager-only supporting data
  useEffect(() => {
    if (!activeAccountId || !propertyId) return;
    if (canManage) {
      loadPendingInbox();
      loadContractors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, propertyId, canManage]);

  // -----------------------------------------
  // Load maintenance requests for dropdown
  // -----------------------------------------
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!activeAccountId || !propertyId || !canManage) return;

    let cancelled = false;

    async function loadRequests() {
      setRequestsLoading(true);
      try {
        const { data, error } = await supabase
          .from("maintenance_requests")
          .select("id,title,status,priority,created_at")
          .eq("account_id", activeAccountId)
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        if (!cancelled && mountedRef.current) setRequests(data ?? []);
      } catch {
        if (!cancelled && mountedRef.current) setRequests([]);
      } finally {
        if (!cancelled && mountedRef.current) setRequestsLoading(false);
      }
    }

    loadRequests();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, propertyId, canManage]);

  const openRequests = useMemo(() => {
    return (requests ?? []).filter((r) => ["open", "new"].includes(String(r.status ?? "").toLowerCase()));
  }, [requests]);

  // -----------------------------
  // Create form
  // -----------------------------
  const [open, setOpen] = useState(false);
  const [maintenanceRequestId, setMaintenanceRequestId] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function onSelectContractor(contractorId) {
    setSelectedContractorId(contractorId);
    if (!contractorId) return;

    const c = contractors.find((x) => x.id === contractorId);
    if (!c) return;

    setContractorName(c.name ?? "");
    setContractorPhone(c.phone ?? "");
  }

  // ✅ Deep-link handler
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!canManage) return;
    if (deepLinkHandledRef.current) return;
    if (!createWOFromUrl || !mrIdFromUrl) return;

    deepLinkHandledRef.current = true;

    setOpen(true);
    setMaintenanceRequestId(mrIdFromUrl);

    if (seedNotesFromUrl) {
      const mr = (requests ?? []).find((r) => r.id === mrIdFromUrl);
      if (mr) {
        setNotes((prev) => {
          if (String(prev || "").trim().length > 0) return prev;
          return `Zgłoszenie: ${mr.title}\nPriorytet: ${mr.priority || "normal"}\nStatus: ${mr.status || ""}\n\n`;
        });
      }
    }

    const hasAny = searchParams.has("createWO") || searchParams.has("mrId") || searchParams.has("seedNotes");

    if (hasAny) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete("createWO");
          p.delete("mrId");
          p.delete("seedNotes");
          return p;
        },
        { replace: true }
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, createWOFromUrl, mrIdFromUrl, seedNotesFromUrl, requests, searchParams]);

  async function handleCreate() {
    if (!activeAccountId || !propertyId) return;

    setSaving(true);
    try {
      await createWorkOrder({
        accountId: activeAccountId,
        propertyId,
        maintenanceRequestId: maintenanceRequestId || null,
        contractorId: selectedContractorId || null,
        contractorName: contractorName || null,
        contractorPhone: contractorPhone || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes: notes || null,
      });

      setOpen(false);
      setMaintenanceRequestId("");
      setContractorName("");
      setContractorPhone("");
      setSelectedContractorId("");
      setScheduledAt("");
      setNotes("");

      setPage(1);
      await reload();
      if (canManage) await loadPendingInbox();
    } catch (e) {
      alert(e?.message ?? t("workOrders.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm(t("workOrders.confirmDeleteWorkOrder"))) return;
    try {
      await deleteWorkOrder(id);
      await reload();
      if (canManage) await loadPendingInbox();
    } catch (e) {
      alert(e?.message ?? t("workOrders.deleteError"));
    }
  }

  // -----------------------------
  // Contractor assignment (RPC)
  // -----------------------------
  const [assigningContractor, setAssigningContractor] = useState(false);
  const [assignContractorId, setAssignContractorId] = useState("");

  async function assignContractorToWorkOrder(workOrderId, contractorId) {
    if (!canManage) return;
    if (!workOrderId || !contractorId) return;

    setAssigningContractor(true);
    try {
      const { error } = await supabase.rpc("work_order_assign_contractor", {
        p_work_order_id: workOrderId,
        p_contractor_id: contractorId,
      });
      if (error) throw error;

      // refresh row + actions + audit
      await reload();
      if (detailOpen && selectedWO?.id === workOrderId) {
        await loadAudit(workOrderId);
      }
    } catch (e) {
      alert(e?.message ?? t("workOrders.assignError"));
    } finally {
      setAssigningContractor(false);
    }
  }

  // -----------------------------
  // DB-driven actions
  // -----------------------------
  async function setStatus(id, nextStatus) {
    setActionBusyId(id);
    try {
      const { error } = await supabase.rpc("work_order_set_status", {
        p_work_order_id: id,
        p_new_status: nextStatus,
        p_apply_if_tenant_allowed: false,
      });

      if (error) throw error;

      await reload();
      if (detailOpen && selectedWO?.id === id) {
        await loadAudit(id);
      }
    } catch (e) {
      alert(e?.message ?? t("workOrders.statusChangeError"));
    } finally {
      setActionBusyId(null);
    }
  }

  async function requestCancellation(id) {
    setActionBusyId(id);
    try {
      const { error } = await supabase.rpc("work_order_set_status", {
        p_work_order_id: id,
        p_new_status: "cancelled",
        p_apply_if_tenant_allowed: true,
      });

      if (error) throw error;

      await reload();
      if (detailOpen && selectedWO?.id === id) {
        await loadAudit(id);
      }
    } catch (e) {
      alert(e?.message ?? t("workOrders.cancelRequestError"));
    } finally {
      setActionBusyId(null);
    }
  }

  const [denyReasonById, setDenyReasonById] = useState({});

  async function approveCancellation(id) {
    setActionBusyId(id);
    try {
      const { error } = await supabase.rpc("work_order_approve_tenant_cancellation", {
        p_work_order_id: id,
      });
      if (error) throw error;

      await reload();
      if (canManage) await loadPendingInbox();
      if (detailOpen && selectedWO?.id === id) {
        await loadAudit(id);
      }
    } catch (e) {
      alert(e?.message ?? t("workOrders.cancelApproveError"));
    } finally {
      setActionBusyId(null);
    }
  }

  async function denyCancellation(id) {
    setActionBusyId(id);
    try {
      const reason = denyReasonById[id] || null;

      const { error } = await supabase.rpc("work_order_deny_tenant_cancellation", {
        p_work_order_id: id,
        p_reason: reason,
      });
      if (error) throw error;

      setDenyReasonById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      await reload();
      if (canManage) await loadPendingInbox();
      if (detailOpen && selectedWO?.id === id) {
        await loadAudit(id);
      }
    } catch (e) {
      alert(e?.message ?? t("workOrders.cancelRejectError"));
    } finally {
      setActionBusyId(null);
    }
  }

  // -----------------------------
  // UX helpers
  // -----------------------------
  function tenantCancelState(wo) {
    if (!isTenant) return { show: false, disabled: true, reason: "" };

    const s = String(wo?.status ?? "").toLowerCase();
    const pending = !!wo?.pending_cancel_request;

    if (["completed", "cancelled"].includes(s)) {
      return { show: false, disabled: true, reason: "" };
    }

    if (pending) {
      return { show: true, disabled: true, reason: t("workOrders.waitingOwnerDecision") };
    }

    return { show: true, disabled: false, reason: "" };
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("workOrders.title")}</h3>
          <p className="text-xs text-slate-500 mt-1">
            Zlecenia dla tej nieruchomości. W przyszłości dodamy przypisanie do kontraktorów + portal wykonawcy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-500">{t("common.perPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPage(1);
                setPageSize(Number.isFinite(n) && n > 0 ? n : 20);
              }}
              className="border rounded-lg px-2 py-2 text-sm bg-white"
            >
              {[10, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
            >
              {open ? "Zamknij" : "Dodaj zlecenie"}
            </button>
          )}
        </div>
      </div>

      {/* ✅ CREATE FORM (WAS MISSING) */}
      {canManage && open && (
        <div className="border rounded-xl p-4 bg-white space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{t("workOrders.new")}</div>
              <div className="text-xs text-slate-500 mt-1">
                Utwórz zlecenie ręcznie lub powiąż ze zgłoszeniem (maintenance request).
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
            >
              Ukryj
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">{t("workOrders.linkedRequestOptional")}</label>
              <select
                value={maintenanceRequestId}
                onChange={(e) => setMaintenanceRequestId(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50"
                disabled={requestsLoading || saving}
              >
                <option value="">— Brak —</option>
                {(openRequests ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} • {r.priority || "normal"} • {r.status}
                  </option>
                ))}
              </select>
              {requestsLoading && <div className="text-[11px] text-slate-400 mt-1">{t("workOrders.loadingRequests")}</div>}
            </div>

            <div>
              <label className="text-xs text-slate-500">{t("workOrders.contractorOptional")}</label>
              <select
                value={selectedContractorId}
                onChange={(e) => onSelectContractor(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50"
                disabled={contractorsLoading || saving}
              >
                <option value="">— Ręcznie / później —</option>
                {(contractors ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `• ${c.phone}` : ""}
                  </option>
                ))}
              </select>
              {contractorsLoading && <div className="text-[11px] text-slate-400 mt-1">{t("workOrders.loadingContractors")}</div>}
            </div>

            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorName")}</label>
              <input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder={t("workOrders.contractorNameExample")}
                disabled={saving}
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorPhone")}</label>
              <input
                value={contractorPhone}
                onChange={(e) => setContractorPhone(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder={t("workOrders.contractorPhoneExample")}
                disabled={saving}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">{t("maintenance.drawer.scheduleOptional")}</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                disabled={saving}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">{t("maintenance.drawer.notes")}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[110px] disabled:bg-slate-50"
                placeholder={t("workOrders.notesPlaceholder")}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMaintenanceRequestId("");
                setSelectedContractorId("");
                setContractorName("");
                setContractorPhone("");
                setScheduledAt("");
                setNotes("");
              }}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
              disabled={saving}
            >
              Wyczyść
            </button>

            <button
              type="button"
              onClick={handleCreate}
              className={`px-4 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-blue-600"}`}
              disabled={saving}
            >
              {saving ? t("common.saving") : t("workOrders.create")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {String(error?.message ?? error)}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!loading && workOrders.length === 0 && <p className="text-sm text-slate-500">{t("workOrders.empty")}</p>}

      {!loading && workOrders.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {workOrders.map((wo) => {
            const scheduled = formatDateTime(wo.scheduled_at);
            const pending = !!wo.pending_cancel_request;
            const lastReqAt = formatDateTime(wo.last_cancel_request_at);
            const allowedMemberActions = allowedActionsById[wo.id] ?? [];

            const tenantState = tenantCancelState(wo);
            const isBusy = actionBusyId === wo.id;

            return (
              <div key={wo.id} className="px-4 py-3 flex justify-between items-start gap-4">
                <button type="button" onClick={() => openDetails(wo)} className="min-w-0 text-left" disabled={isBusy}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={wo.status} />

                    {pending && (
                      <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                        Prośba o anulowanie{lastReqAt ? ` • ${lastReqAt}` : ""}
                      </span>
                    )}

                    {wo.contractor_name && <span className="text-sm font-medium text-slate-900">{wo.contractor_name}</span>}
                    {wo.contractor_phone && <span className="text-xs text-slate-500">{wo.contractor_phone}</span>}
                  </div>

                  {wo.maintenance_requests?.title && (
                    <p className="text-sm text-slate-700 mt-1">
                      Powiązane zgłoszenie: <b>{wo.maintenance_requests.title}</b>
                    </p>
                  )}

                  {scheduled && <p className="text-xs text-slate-500 mt-1">{t("common.dueDate")}: {scheduled}</p>}

                  {wo.notes && <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{wo.notes}</p>}
                </button>

                <div className="flex flex-col gap-2 text-sm shrink-0 items-end">
                  {tenantState.show && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        disabled={tenantState.disabled || isBusy}
                        onClick={() => requestCancellation(wo.id)}
                        className={`hover:underline ${
                          tenantState.disabled || isBusy ? "text-slate-400 cursor-not-allowed" : "text-amber-700"
                        }`}
                        title={tenantState.reason || ""}
                      >
                        {isBusy ? t("common.sending") : t("workOrders.requestCancellation")}
                      </button>

                      {(tenantState.reason || wo?.pending_cancel_request) && (
                        <span className="text-xs text-slate-500">{tenantState.reason}</span>
                      )}
                    </div>
                  )}

                  {canManage && pending && (
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => approveCancellation(wo.id)}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-emerald-700"}`}
                        >
                          {isBusy ? t("common.processing") : t("workOrders.approveCancellation")}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => denyCancellation(wo.id)}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-rose-700"}`}
                        >
                          {isBusy ? t("common.processing") : t("workOrders.reject")}
                        </button>
                      </div>

                      <input
                        disabled={isBusy}
                        value={denyReasonById[wo.id] ?? ""}
                        onChange={(e) =>
                          setDenyReasonById((prev) => ({
                            ...prev,
                            [wo.id]: e.target.value,
                          }))
                        }
                        className="border rounded-lg px-2 py-1 text-xs w-56 disabled:bg-slate-50"
                        placeholder={t("workOrders.reasonOptional")}
                      />
                    </div>
                  )}

                  {canManage && !pending && (
                    <div className="flex gap-3">
                      {allowedMemberActions.includes("in_progress") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "in_progress")}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-blue-600"}`}
                        >
                          W trakcie
                        </button>
                      )}

                      {allowedMemberActions.includes("cancelled") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "cancelled")}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-slate-600"}`}
                        >
                          Anuluj
                        </button>
                      )}

                      {allowedMemberActions.includes("completed") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "completed")}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-green-700"}`}
                        >
                          Zakończ
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(wo.id)}
                        className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-rose-600"}`}
                      >
                        Usuń
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onPageSizeChange={(n) => {
            const next = Number.isFinite(n) && n > 0 ? n : 20;
            setPage(1);
            setPageSize(next);
          }}
          t={t}
        />
      )}

      <Modal open={detailOpen} onClose={closeDetails} title={t("workOrders.detailsTitle")}>
        {!selectedWO ? (
          <p className="text-sm text-slate-500">{t("common.noData")}</p>
        ) : (
          <div className="space-y-6">
            {/* header summary */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={selectedWO.status} />
                  {selectedWO.pending_cancel_request && (
                    <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                      Prośba o anulowanie
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-900 mt-2 font-medium">{selectedWO.contractor_name || "Zlecenie"}</p>

                {selectedWO.contractor_phone && <p className="text-xs text-slate-500 mt-1">{t("common.phone")}: {selectedWO.contractor_phone}</p>}

                {selectedWO.scheduled_at && (
                  <p className="text-xs text-slate-500 mt-1">{t("common.dueDate")}: {formatDateTime(selectedWO.scheduled_at)}</p>
                )}
              </div>
            </div>

            {selectedWO.notes && (
              <div className="bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">{selectedWO.notes}</div>
            )}

            {/* ✅ B3 Financials */}
            <div className="border rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">{t("finance.title")}</h4>
                  <p className="text-xs text-slate-500 mt-1">{t("workOrders.financeSubtitle")}</p>
                </div>

                <button
                  type="button"
                  onClick={() => loadFinancials(selectedWO.id)}
                  className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
                  disabled={finLoading || finSaving}
                >
                  Odśwież
                </button>
              </div>

              {finLoading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : !financials ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">{t("workOrders.financeEmpty")}</p>
                  <button
                    type="button"
                    onClick={() => finCreateOrSaveDraft(selectedWO.id)}
                    className={`px-3 py-2 text-sm rounded-lg text-white ${finSaving ? "bg-slate-400" : "bg-blue-600"}`}
                    disabled={finSaving}
                    title={t("workOrders.createFinanceRecordTitle")}
                  >
                    {finSaving ? t("common.saving") : t("workOrders.createQuoteDraft")}
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="border rounded-lg p-3 bg-slate-50">
                    <div className="text-sm font-semibold text-slate-900">{t("workOrders.finSummaryTitle")}</div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="rounded border border-slate-200 bg-white p-2">
                        <div className="text-xs text-slate-500">{t("workOrders.quote")}</div>
                        <div className="text-sm font-semibold text-slate-900 mt-1">
                          {formatMoney(financials.quote_amount, financials.quote_currency)}
                        </div>
                      </div>
                      <div className="rounded border border-slate-200 bg-white p-2">
                        <div className="text-xs text-slate-500">{t("workOrders.invoice")}</div>
                        <div className="text-sm font-semibold text-slate-900 mt-1">
                          {formatMoney(financials.invoice_amount, financials.invoice_currency || financials.quote_currency)}
                        </div>
                      </div>
                      <div className="rounded border border-slate-200 bg-white p-2">
                        <div className="text-xs text-slate-500">{t("workOrders.margin")}</div>
                        <div className="text-sm font-semibold text-slate-900 mt-1">
                          {Number.isFinite(Number(financials.invoice_amount)) && Number.isFinite(Number(financials.quote_amount))
                            ? formatMoney(
                                Number(financials.invoice_amount) - Number(financials.quote_amount),
                                financials.invoice_currency || financials.quote_currency
                              )
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quote */}
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{t("workOrders.quote")}</div>
                      <div className="text-xs text-slate-500">
                        Status: <span className="font-medium">{financials.quote_status}</span>
                        {financials.quote_submitted_at ? ` • wysłano: ${formatDateTime(financials.quote_submitted_at)}` : ""}
                        {financials.approved_at ? ` • zatw.: ${formatDateTime(financials.approved_at)}` : ""}
                        {financials.rejected_at ? ` • odrz.: ${formatDateTime(financials.rejected_at)}` : ""}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-slate-500">{t("payments.amount")}</label>
                        <input
                          value={finQuoteAmount}
                          onChange={(e) => setFinQuoteAmount(e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                          disabled={finSaving}
                          placeholder={t("workOrders.amountExample250")}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">{t("common.currency")}</label>
                        <select
                          value={finQuoteCurrency}
                          onChange={(e) => setFinQuoteCurrency(e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                          disabled={finSaving}
                        >
                          {["PLN", "GBP", "EUR", "USD"].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <label className="text-xs text-slate-500">{t("attachments.preview")}</label>
                        <div className="mt-1 border rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
                          {formatMoney(financials.quote_amount, financials.quote_currency)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs text-slate-500">{t("workOrders.quoteNotes")}</label>
                      <textarea
                        value={finQuoteNotes}
                        onChange={(e) => setFinQuoteNotes(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-slate-50"
                        disabled={finSaving}
                        placeholder={t("maintenance.drawer.optional")}
                      />
                    </div>

                    {financials.quote_status === "rejected" && financials.rejection_reason && (
                      <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                        Odrzucono: {financials.rejection_reason}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => finCreateOrSaveDraft(selectedWO.id)}
                        disabled={finSaving || !isContractor}
                        title={!isContractor ? t("workOrders.contractorOnly") : ""}
                        className={`px-3 py-2 text-sm rounded-lg text-white ${
                          finSaving || !isContractor ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600"
                        }`}
                      >
                        {finSaving ? "Zapisywanie…" : "Zapisz draft"}
                      </button>

                      {financials.quote_status === "draft" && (
                        <button
                          type="button"
                          onClick={() => finSubmit(selectedWO.id)}
                          disabled={finSaving || !isContractor}
                          title={!isContractor ? t("workOrders.contractorOnly") : ""}
                          className={`px-3 py-2 text-sm rounded-lg text-white ${
                            finSaving || !isContractor ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900"
                          }`}
                        >
                          Wyślij wycenę
                        </button>
                      )}

                      {financials.quote_status === "submitted" && (
                        <>
                          <button
                            type="button"
                            onClick={() => finApprove(selectedWO.id)}
                            disabled={finSaving}
                            className={`px-3 py-2 text-sm rounded-lg text-white ${finSaving ? "bg-slate-400" : "bg-emerald-600"}`}
                          >
                            Zatwierdź
                          </button>

                          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            <input
                              value={finRejectReason}
                              onChange={(e) => setFinRejectReason(e.target.value)}
                              disabled={finSaving}
                              className="border rounded-lg px-3 py-2 text-sm w-full md:w-72 disabled:bg-slate-50"
                              placeholder={t("workOrders.rejectReasonOptional")}
                            />
                            <button
                              type="button"
                              onClick={() => finReject(selectedWO.id)}
                              disabled={finSaving}
                              className={`px-3 py-2 text-sm rounded-lg text-white ${finSaving ? "bg-slate-400" : "bg-rose-600"}`}
                            >
                              Odrzuć
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Invoice */}
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{t("workOrders.invoice")}</div>
                      <div className="text-xs text-slate-500">
                        {financials.invoice_amount != null
                          ? `Kwota: ${formatMoney(financials.invoice_amount, financials.invoice_currency)}`
                          : "Brak kwoty"}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500">{t("workOrders.invoiceAmount")}</label>
                        <input
                          value={finInvoiceAmount}
                          onChange={(e) => setFinInvoiceAmount(e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                          disabled={finSaving}
                          placeholder={t("workOrders.amountExample300")}
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-500">{t("common.currency")}</label>
                        <select
                          value={finInvoiceCurrency}
                          onChange={(e) => setFinInvoiceCurrency(e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                          disabled={finSaving}
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
                          value={finInvoiceIssuedAt}
                          onChange={(e) => setFinInvoiceIssuedAt(e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                          disabled={finSaving}
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-500">{t("workOrders.invoiceDueAt")}</label>
                        <input
                          type="datetime-local"
                          value={finInvoiceDueAt}
                          onChange={(e) => setFinInvoiceDueAt(e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                          disabled={finSaving}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => finSaveInvoice(selectedWO.id)}
                        disabled={finSaving || !isContractor}
                        title={!isContractor ? t("workOrders.contractorOnly") : ""}
                        className={`px-3 py-2 text-sm rounded-lg text-white ${
                          finSaving || !isContractor ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600"
                        }`}
                      >
                        {finSaving ? t("common.saving") : t("workOrders.saveInvoice")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canManage && (
              <div className="border rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-slate-900">{t("ratings.title")}</h4>
                  {ratingRow?.updated_at ? (
                    <p className="text-xs text-slate-500">
                      {t("common.updatedAt")}: {formatDateTime(ratingRow.updated_at)}
                    </p>
                  ) : null}
                </div>

                {ratingUnavailable ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    {t("ratings.unavailable")}
                  </p>
                ) : String(selectedWO.status || "").toLowerCase() !== "completed" ? (
                  <p className="text-sm text-slate-500 mt-2">{t("ratings.afterCompletionOnly")}</p>
                ) : ratingLoading ? (
                  <div className="mt-2">
                    <Skeleton className="h-10" />
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const active = Number(ratingValue || 0) === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRatingValue(String(n))}
                            className={`px-3 py-1.5 text-sm rounded-lg border ${
                              active
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            disabled={ratingSaving}
                          >
                            {n} ★
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-slate-50"
                      placeholder={t("ratings.commentOptional")}
                      disabled={ratingSaving}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => saveContractorRating(selectedWO.id)}
                        disabled={ratingSaving}
                        className={`px-3 py-2 text-sm rounded-lg text-white ${
                          ratingSaving ? "bg-slate-400" : "bg-blue-600"
                        }`}
                      >
                        {ratingSaving ? t("common.saving") : t("ratings.save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ✅ A4 Attachments */}
            {isContractor ? (
              <ContractorAttachmentsPanel
                accountId={activeAccountId}
                workOrderId={selectedWO.id}
                canUpload={isContractor}
              />
            ) : (
              <div>
                <h4 className="font-semibold text-slate-900">{t("attachments.workOrderTitle")}</h4>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">{t("attachments.workOrderSubtitle")}</p>

                  <label
                    className={`text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 cursor-pointer ${
                      attachmentsUploading ? "opacity-70" : ""
                    }`}
                    title={t("attachments.addFiles")}
                  >
                    {attachmentsUploading ? "Wgrywanie…" : "Dodaj pliki"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = "";
                        handleUploadAttachments(selectedWO.id, files);
                      }}
                      disabled={attachmentsUploading}
                    />
                  </label>
                </div>

                {attachmentsLoading ? (
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : attachments.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-3">{t("attachments.emptyWorkOrder")}</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {attachments.map((a) => {
                      const isImage = String(a?.mime_type || "").startsWith("image/");
                      const previewUrl = isImage ? signedUrlByPath[a.storage_path] : null;

                      return (
                        <div key={a.id} className="border rounded-lg p-3 flex gap-3">
                          <div className="w-20 h-20 rounded-lg border bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                            {isImage && previewUrl ? (
                              <img src={previewUrl} alt={a.file_name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs text-slate-500 text-center px-2">
                                {a.kind === "photo" ? t("attachments.photo") : t("attachments.document")}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900 truncate">{a.file_name}</div>

                            <div className="text-xs text-slate-500 mt-1">
                              {a.mime_type || "—"} {" • "} {formatBytes(a.file_size)} {" • "}{" "}
                              {formatDateTime(a.created_at)}
                            </div>

                            <div className="mt-2 flex gap-3">
                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(a)}
                                className="text-sm text-blue-600 hover:underline"
                              >
                                Otwórz / Pobierz
                              </button>

                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(a)}
                                  className="text-sm text-rose-600 hover:underline"
                                >
                                  Usuń
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Activity */}
            <div>
              <h4 className="font-semibold text-slate-900">{t("workOrder.activity")}</h4>

              {auditLoading ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : audit.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">{t("workOrder.noEntries")}</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {audit.map((e) => (
                    <div key={e.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">
                          {String(e.action || "").replaceAll("_", " ")}
                        </div>
                        <div className="text-xs text-slate-500 shrink-0">{formatDateTime(e.created_at)}</div>
                      </div>

                      {(e.old_value || e.new_value) && (
                        <pre className="mt-2 text-xs bg-slate-50 p-2 rounded overflow-auto">
{JSON.stringify({ old: e.old_value, new: e.new_value }, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
