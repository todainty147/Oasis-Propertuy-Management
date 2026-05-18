// src/components/WorkOrdersSection.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import ContractorAttachmentsPanel from "./work-orders/ContractorAttachmentsPanel";
import ExternalMarketplacePanel from "./work-orders/ExternalMarketplacePanel";
import { useAccount } from "../context/AccountContext";
import {
  approveWorkOrderTenantCancellation,
  createWorkOrder,
  deleteWorkOrder,
  denyWorkOrderTenantCancellation,
  fetchWorkOrders,
  getWorkOrderAllowedActions,
  getWorkOrderAllowedActionsBulk,
  listAssignableContractors,
  listPendingCancellationWorkOrders,
  listWorkOrderAuditLog,
  listWorkOrderStatusDefinitions,
  setWorkOrderStatus,
} from "../services/workOrderService";
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
import { formatCurrencyAmount, getCurrencyOptions, getDefaultCurrency } from "../utils/currency";
import { isManageRole } from "../utils/permissions";
import { normalizeWorkOrderStatus } from "../utils/statuses";
import { listMaintenanceRequestsByProperty } from "../services/maintenanceService";
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

function formatMoney(val, currency = getDefaultCurrency()) {
  return formatCurrencyAmount(val, { currency });
}

function translateWorkOrderStatus(status, t) {
  const key = normalizeWorkOrderStatus(status);
  if (key === "assigned") return t("status.wo.assigned");
  if (key === "in_progress") return t("status.wo.in_progress");
  if (key === "completed") return t("status.wo.completed");
  if (key === "cancelled") return t("status.wo.cancelled");
  if (key === "blocked") return t("workOrder.blocked");
  return status || "—";
}

function normalizePriority(priority) {
  const p = String(priority ?? "").trim().toLowerCase();
  if (["low", "niski"].includes(p)) return "low";
  if (["normal", "normalny"].includes(p)) return "normal";
  if (["high", "wysoki"].includes(p)) return "high";
  if (["urgent", "pilny"].includes(p)) return "urgent";
  if (["critical", "krytyczny"].includes(p)) return "critical";
  return p;
}

function translatePriority(priority, t) {
  const key = normalizePriority(priority);
  if (key === "low") return t("priority.low");
  if (key === "high") return t("priority.high");
  if (key === "urgent") return t("priority.urgent");
  if (key === "critical") return t("priority.critical");
  return t("priority.normal");
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

function isRatingsUnavailableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("could not find the table 'public.contractor_ratings'") ||
    msg.includes('relation "contractor_ratings" does not exist') ||
    msg.includes("missing contractor_ratings table")
  );
}

function Modal({ open, onClose, title, children, t }) {
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
            {t("common.close")}
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
          aria-label={t("common.perPage")}
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
  const { t, lang } = useI18n();

  // ✅ NEXT-4: allow deep-link from Maintenance Requests list
  const [searchParams, setSearchParams] = useSearchParams();
  const createWOFromUrl = searchParams.get("createWO") === "1";
  const mrIdFromUrl = searchParams.get("mrId") || "";
  const seedNotesFromUrl = searchParams.get("seedNotes") === "1";

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);
  const isTenant = useMemo(() => role === "tenant", [role]);

  const canManage = useMemo(() => isManageRole(role), [role]);

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
    const s = normalizeWorkOrderStatus(status);
    return statusLabelByKey?.[s] || null;
  }

  function StatusPill({ status }) {
    const base = "text-xs px-2 py-0.5 rounded border";
    const s = normalizeWorkOrderStatus(status);
    const label = translateWorkOrderStatus(getStatusLabel(s) || s, t);

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

      const map = await getWorkOrderAllowedActionsBulk(ids, {
        accountId: activeAccountId,
      });
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
      const actions = await getWorkOrderAllowedActions(workOrderId, {
        accountId: activeAccountId,
      });
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
      const rows = await listWorkOrderAuditLog(workOrderId);
      if (mountedRef.current) setAudit(rows);
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
  const [finQuoteCurrency, setFinQuoteCurrency] = useState(getDefaultCurrency());
  const [finQuoteNotes, setFinQuoteNotes] = useState("");
  const [finRejectReason, setFinRejectReason] = useState("");

  const [finInvoiceAmount, setFinInvoiceAmount] = useState("");
  const [finInvoiceCurrency, setFinInvoiceCurrency] = useState(getDefaultCurrency());
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
    setFinQuoteCurrency(row?.quote_currency || getDefaultCurrency());
    setFinQuoteNotes(row?.quote_notes || "");

    setFinInvoiceAmount(typeof iAmt === "number" || typeof iAmt === "string" ? String(iAmt) : "");
    setFinInvoiceCurrency(row?.invoice_currency || getDefaultCurrency());

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
        quoteCurrency: finQuoteCurrency || getDefaultCurrency(),
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
      await submitQuote({ workOrderId });
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
      await approveQuote({ workOrderId });
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
        invoiceCurrency: finInvoiceCurrency || getDefaultCurrency(),
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
      const rows = await listAssignableContractors(activeAccountId);
      if (mountedRef.current) setContractors(rows);
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

    // ✅ A4
    setAttachments([]);
    setSignedUrlByPath({});

    // ✅ B3
    setFinancials(null);
    setFinQuoteAmount("");
    setFinQuoteCurrency(getDefaultCurrency());
    setFinQuoteNotes("");
    setFinRejectReason("");
    setFinInvoiceAmount("");
    setFinInvoiceCurrency(getDefaultCurrency());
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
      const result = await fetchWorkOrders({
        accountId: activeAccountId,
        propertyId,
        page,
        pageSize,
      });

      const rows = result.data ?? [];
      if (mountedRef.current) {
        setWorkOrders(rows);
        setTotalCount(result.count ?? 0);
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
  const [, setPendingInbox] = useState([]);

  async function loadPendingInbox() {
    if (!activeAccountId || !canManage) return;

    try {
      const rows = await listPendingCancellationWorkOrders({
        accountId: activeAccountId,
        propertyId,
        limit: 20,
      });
      if (mountedRef.current) setPendingInbox(rows);
    } catch {
      if (mountedRef.current) setPendingInbox([]);
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
        const map = await listWorkOrderStatusDefinitions();

        if (cancelled || !mountedRef.current) return;
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
        const result = await listMaintenanceRequestsByProperty({
          accountId: activeAccountId,
          propertyId,
          page: 1,
          pageSize: 100,
        });
        if (!cancelled && mountedRef.current) setRequests(result.data ?? []);
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
          return `${t("workOrders.linkedRequest")}: ${mr.title}\n${t("common.priority")}: ${mr.priority || "normal"}\n${t("common.status")}: ${mr.status || ""}\n\n`;
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
  // DB-driven actions
  // -----------------------------
  async function setStatus(id, nextStatus) {
    setActionBusyId(id);
    try {
      await setWorkOrderStatus(
        {
          workOrderId: id,
          newStatus: nextStatus,
          applyIfTenantAllowed: false,
        },
        {
          accountId: activeAccountId,
        },
      );

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
      await setWorkOrderStatus(
        {
          workOrderId: id,
          newStatus: "cancelled",
          applyIfTenantAllowed: true,
        },
        {
          accountId: activeAccountId,
        },
      );

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
      await approveWorkOrderTenantCancellation(id, {
        accountId: activeAccountId,
      });

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

      await denyWorkOrderTenantCancellation(
        {
          workOrderId: id,
          reason,
        },
        {
          accountId: activeAccountId,
        },
      );

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
            {t("workOrders.subtitle")}
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
              aria-label={t("common.perPage")}
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
              {open ? t("common.close") : t("workOrders.create")}
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
                {t("workOrders.createHint")}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
            >
              {t("common.hide")}
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
                aria-label={t("workOrders.linkedRequestOptional")}
              >
                <option value="">{`— ${t("common.none")} —`}</option>
                {(openRequests ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} • {translatePriority(r.priority, t)} • {translateWorkOrderStatus(r.status, t)}
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
                aria-label={t("workOrders.contractorOptional")}
              >
                <option value="">{t("workOrders.contractorManualLater")}</option>
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
              {t("common.clear")}
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
                        {t("workOrders.cancelRequestLabel")}{lastReqAt ? ` • ${lastReqAt}` : ""}
                      </span>
                    )}

                    {wo.contractor_name && <span className="text-sm font-medium text-slate-900">{wo.contractor_name}</span>}
                    {wo.contractor_phone && <span className="text-xs text-slate-500">{wo.contractor_phone}</span>}
                  </div>

                  {wo.maintenance_requests?.title && (
                    <p className="text-sm text-slate-700 mt-1">
                      {t("workOrders.linkedRequest")}: <b>{wo.maintenance_requests.title}</b>
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
                          {t("workOrders.startWork")}
                        </button>
                      )}

                      {allowedMemberActions.includes("cancelled") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "cancelled")}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-slate-600"}`}
                        >
                          {t("common.cancel")}
                        </button>
                      )}

                      {allowedMemberActions.includes("completed") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "completed")}
                          className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-green-700"}`}
                        >
                          {t("workOrders.completeWork")}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(wo.id)}
                        className={`hover:underline ${isBusy ? "text-slate-400 cursor-not-allowed" : "text-rose-600"}`}
                      >
                        {t("attachments.delete")}
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

      <Modal open={detailOpen} onClose={closeDetails} title={t("workOrders.detailsTitle")} t={t}>
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
                      {t("workOrders.cancelRequestLabel")}
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-900 mt-2 font-medium">{selectedWO.contractor_name || t("workOrder.shortLabel")}</p>

                {selectedWO.contractor_phone && <p className="text-xs text-slate-500 mt-1">{t("common.phone")}: {selectedWO.contractor_phone}</p>}

                {selectedWO.scheduled_at && (
                  <p className="text-xs text-slate-500 mt-1">{t("common.dueDate")}: {formatDateTime(selectedWO.scheduled_at)}</p>
                )}
              </div>
            </div>

            {selectedWO.notes && (
              <div className="bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">{selectedWO.notes}</div>
            )}

            <ExternalMarketplacePanel
              key={`${activeAccountId || "no-account"}:${selectedWO.id}:${selectedWO?.properties?.country_code || "unknown"}`}
              accountId={activeAccountId}
              workOrder={selectedWO}
              canManage={canManage}
              lang={lang}
            />

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
                  {t("common.refresh")}
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
                        {t("common.status")}: <span className="font-medium">{translateQuoteStatus(financials.quote_status, t)}</span>
                        {financials.quote_submitted_at ? ` • ${t("workOrders.submittedAt")}: ${formatDateTime(financials.quote_submitted_at)}` : ""}
                        {financials.approved_at ? ` • ${t("workOrders.approvedAt")}: ${formatDateTime(financials.approved_at)}` : ""}
                        {financials.rejected_at ? ` • ${t("workOrders.rejectedAt")}: ${formatDateTime(financials.rejected_at)}` : ""}
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
                          {getCurrencyOptions().map((c) => (
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

                    {normalizeQuoteStatus(financials.quote_status) === "rejected" && financials.rejection_reason && (
                      <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                        {t("workOrders.rejected")}: {financials.rejection_reason}
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
                        {finSaving ? t("common.saving") : t("workOrders.saveDraft")}
                      </button>

                      {normalizeQuoteStatus(financials.quote_status) === "draft" && (
                        <button
                          type="button"
                          onClick={() => finSubmit(selectedWO.id)}
                          disabled={finSaving || !isContractor}
                          title={!isContractor ? t("workOrders.contractorOnly") : ""}
                          className={`px-3 py-2 text-sm rounded-lg text-white ${
                            finSaving || !isContractor ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900"
                          }`}
                        >
                          {t("workOrders.submitQuote")}
                        </button>
                      )}

                      {normalizeQuoteStatus(financials.quote_status) === "submitted" && (
                        <>
                          <button
                            type="button"
                            onClick={() => finApprove(selectedWO.id)}
                            disabled={finSaving}
                            className={`px-3 py-2 text-sm rounded-lg text-white ${finSaving ? "bg-slate-400" : "bg-emerald-600"}`}
                          >
                            {t("workOrders.approve")}
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
                              {t("workOrders.reject")}
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
                          {getCurrencyOptions().map((c) => (
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
                ) : normalizeWorkOrderStatus(selectedWO.status) !== "completed" ? (
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
                                {t("workOrders.openDownload")}
                              </button>

                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(a)}
                                  className="text-sm text-rose-600 hover:underline"
                                >
                                  {t("attachments.delete")}
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
