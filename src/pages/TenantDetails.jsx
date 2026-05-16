// src/pages/TenantDetails.jsx
import { useParams, useNavigate, Navigate, useSearchParams, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Badge from "../components/Badge";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import TenantDocumentsSection from "../components/TenantDocumentsSection";
import LeaseSummaryCard from "../components/LeaseSummaryCard";
import TenantTimelineCard from "../components/TenantTimelineCard";
import CustomFieldsReadOnlySection from "../components/CustomFieldsReadOnlySection";
import CustomFieldsFormSection from "../components/CustomFieldsFormSection";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { isManageRole, can } from "../utils/permissions";
import { formatCurrencyAmount } from "../utils/currency";
import { buildTenantPaymentDisplayRows } from "../utils/tenantPortal";
import {
  listEntityCustomFieldEditorState,
  listEntityCustomFieldValues,
  saveEntityCustomFieldValues,
  validateCustomFieldEntries,
  validateCustomFieldInput,
} from "../services/customFieldService";
import { updateTenant } from "../services/tenantService";

// ── Payment status helpers (locale-agnostic) ─────────────────────────────────

function paymentIsOverdue(p) {
  const s = String(p?.status || "").toLowerCase();
  return s.includes("zaleg") || s === "overdue" || s.includes("fällig");
}

function paymentIsPaid(p) {
  const s = String(p?.status || "").toLowerCase();
  return s.includes("opłac") || s === "paid" || s.includes("bezahl");
}

function safeAmount(value) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

/* ======================
   SKELETON
   ====================== */

function TenantDetailsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

/* ======================
   EDIT MODAL
   ====================== */

function EditTenantModal({
  open,
  onClose,
  tenant,
  properties,
  activeAccountId,
  canUpdateTenant,
  t,
  onSaved,
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", propertyId: "" });
  const [definitions, setDefinitions] = useState([]);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success"|"error", message }
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open || !tenant) return;
    setForm({
      name: tenant.name ?? "",
      email: tenant.email ?? "",
      phone: tenant.phone ?? "",
      propertyId: tenant.propertyId ?? "",
    });
    setFeedback(null);
    setErrors({});
  }, [open, tenant]);

  useEffect(() => {
    if (!open || !activeAccountId || !tenant?.id || !canUpdateTenant) {
      setDefinitions([]);
      setValues({});
      return;
    }
    let cancelled = false;
    listEntityCustomFieldEditorState({
      accountId: activeAccountId,
      entityType: "tenant",
      entityId: tenant.id,
    })
      .then((state) => {
        if (cancelled) return;
        setDefinitions(state.definitions);
        setValues(state.values);
        setErrors({});
      })
      .catch(() => {
        if (cancelled) return;
        setDefinitions([]);
        setValues({});
      });
    return () => { cancelled = true; };
  }, [open, activeAccountId, canUpdateTenant, tenant?.id]);

  function handleFieldChange(def, value) {
    const defId = String(def?.id || "");
    const v = validateCustomFieldInput(def, value);
    setValues((cur) => ({ ...cur, [defId]: value }));
    setErrors((cur) => ({ ...cur, [defId]: v.error || "" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!tenant?.id || !activeAccountId) return;
    const validation = validateCustomFieldEntries(definitions, values);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await updateTenant(activeAccountId, tenant.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        propertyId: form.propertyId || null,
      });
      await saveEntityCustomFieldValues({
        accountId: activeAccountId,
        entityId: tenant.id,
        definitions,
        values: validation.normalizedValues,
      });
      setFeedback({ type: "success", message: t("tenantDetails.savedSuccess") });
      onSaved?.();
    } catch (err) {
      setFeedback({ type: "error", message: err?.message || t("tenantDetails.saveError") });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{t("tenantDetails.editTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">{t("tenants.name")}</span>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">{t("tenants.email")}</span>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">{t("tenants.phone")}</span>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">{t("common.property")}</span>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  value={form.propertyId}
                  onChange={(e) => setForm((c) => ({ ...c, propertyId: e.target.value }))}
                >
                  <option value="">{t("properties.noProperty")}</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.address}</option>
                  ))}
                </select>
              </label>
            </div>

            <CustomFieldsFormSection
              title={t("customFields.tenantFieldsTitle")}
              definitions={definitions}
              values={values}
              errors={errors}
              onChange={handleFieldChange}
              disabled={saving}
              emptyMessage={t("customFields.tenantFieldsEmpty")}
            />

            {feedback && (
              <p className={`text-sm rounded-lg px-3 py-2 ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}>
                {feedback.message}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              {saving ? t("common.saving") : t("tenants.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ======================
   TENANT DETAILS
   ====================== */

export default function TenantDetails({
  loading = false,
  tenants = [],
  properties = [],
  payments = [],
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setTitle } = usePageTitle();
  const { accountLoading, activeAccountId, activeRole, activePermissionContext } = useAccount();
  const { t } = useI18n();
  const canManageLease  = isManageRole(activeRole);
  const canUpdateTenant = can(activePermissionContext, "tenants", "update");

  const [customFieldRows, setCustomFieldRows]     = useState([]);
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "overview",  label: t("tenantDetails.tab.overview")  },
    { id: "payments",  label: t("tenantDetails.tab.payments")  },
    { id: "documents", label: t("tenantDetails.tab.documents") },
    { id: "timeline",  label: t("tenantDetails.tab.timeline")  },
  ];
  const VALID_TABS = new Set(TABS.map((tb) => tb.id));
  const rawTab  = searchParams.get("tab");
  const activeTab = (rawTab && VALID_TABS.has(rawTab)) ? rawTab : "overview";

  function setTab(tab) {
    setSearchParams({ tab }, { replace: true });
  }

  // ── Data ──────────────────────────────────────────────────────────────────────

  const tenant   = tenants.find((tn) => String(tn.id) === String(id));
  const property = properties.find((p) => String(p.id) === String(tenant?.propertyId));

  useEffect(() => {
    if (tenant?.name) setTitle(tenant.name);
  }, [tenant?.name, setTitle]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeAccountId || !tenant?.id) {
        if (!cancelled) setCustomFieldRows([]);
        return;
      }
      setCustomFieldsLoading(true);
      try {
        const rows = await listEntityCustomFieldValues({
          accountId: activeAccountId,
          entityType: "tenant",
          entityId: tenant.id,
        });
        if (!cancelled) setCustomFieldRows(rows);
      } catch {
        if (!cancelled) setCustomFieldRows([]);
      } finally {
        if (!cancelled) setCustomFieldsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeAccountId, tenant?.id]);

  async function refreshCustomFields() {
    if (!activeAccountId || !tenant?.id) return;
    setCustomFieldsLoading(true);
    try {
      const rows = await listEntityCustomFieldValues({
        accountId: activeAccountId,
        entityType: "tenant",
        entityId: tenant.id,
      });
      setCustomFieldRows(rows);
    } catch {
      setCustomFieldRows([]);
    } finally {
      setCustomFieldsLoading(false);
    }
  }

  // ── Early states ──────────────────────────────────────────────────────────────

  if (loading || accountLoading) return <TenantDetailsSkeleton />;
  if (!canManageLease) return <Navigate to="/dashboard" replace />;

  if (!tenant) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p>{t("tenantDetails.notFound")}</p>
        <button className="mt-4 text-blue-600" onClick={() => navigate("/tenants")}>
          {t("common.back")}
        </button>
      </div>
    );
  }

  // ── Derived payment data ───────────────────────────────────────────────────────

  const tenantPayments = payments.filter((p) => String(p.tenantId) === String(tenant.id));
  const tenantDisplayPayments = buildTenantPaymentDisplayRows(tenantPayments);

  const paidAmount    = tenantDisplayPayments
    .filter(paymentIsPaid)
    .reduce((sum, p) => sum + safeAmount(p.amount), 0);

  const overdueAmount = tenantDisplayPayments
    .filter(paymentIsOverdue)
    .reduce((sum, p) => sum + safeAmount(p.amount), 0);

  const openAmount = tenantDisplayPayments
    .filter((p) => !paymentIsPaid(p))
    .reduce((sum, p) => sum + safeAmount(p.amount), 0);

  let tenantStatus = t("tenants.paymentNone");
  if (overdueAmount > 0 && paidAmount > 0) tenantStatus = "partial";
  else if (overdueAmount > 0) tenantStatus = "overdue";
  else if (openAmount > 0) tenantStatus = "pending";
  else if (paidAmount > 0) tenantStatus = "paid";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <EditTenantModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        tenant={tenant}
        properties={properties}
        activeAccountId={activeAccountId}
        canUpdateTenant={canUpdateTenant}
        t={t}
        onSaved={refreshCustomFields}
      />

      <div className="space-y-4">
        <DashboardBreadcrumbs
          items={[
            { label: t("sidebar.tenants"), to: "/tenants" },
            { label: tenant.name },
          ]}
        />

        {/* ── PERSISTENT HEADER ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 truncate">{tenant.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {tenant.email && <span>{tenant.email}</span>}
                  {tenant.email && tenant.phone && (
                    <span className="mx-2 text-slate-300">·</span>
                  )}
                  {tenant.phone && <span>{tenant.phone}</span>}
                  {property && (
                    <>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-slate-700 font-medium">{property.address}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {canUpdateTenant && (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {t("properties.edit")}
                  </button>
                )}
                <Badge status={tenantStatus} />
              </div>
            </div>
          </div>

          {/* ── TAB NAV ──────────────────────────────────────────────────────── */}
          <div className="border-t border-slate-100 px-6">
            <nav className="-mb-px flex overflow-x-auto" aria-label="Tenant sections">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Payment summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{t("tenantDetails.unit")}</p>
                <p className="font-semibold text-slate-900 mt-1">{property?.address || "—"}</p>
                {property?.city && (
                  <p className="text-sm text-slate-500">{property.city}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{t("tenantDetails.paidAmount")}</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">
                  {formatCurrencyAmount(paidAmount)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{t("tenantDetails.overdueAmount")}</p>
                <p className={`text-xl font-bold mt-1 ${overdueAmount > 0 ? "text-rose-600" : "text-slate-900"}`}>
                  {formatCurrencyAmount(overdueAmount)}
                </p>
              </div>
            </div>

            <LeaseSummaryCard
              accountId={activeAccountId}
              propertyId={tenant.propertyId || null}
              tenantId={tenant.id}
              canManage={canManageLease}
            />

            <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900">{t("rentPlans.pageTitle")}</p>
                <p className="text-sm text-slate-500 mt-0.5">{t("rentPlans.pageSubtitle")}</p>
              </div>
              <Link
                to={`/finance/rent-plans?tenant=${tenant.id}`}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t("rentPlans.pageTitle")} →
              </Link>
            </div>

            <CustomFieldsReadOnlySection
              title={t("customFields.tenantFieldsTitle")}
              rows={customFieldRows}
              loading={customFieldsLoading}
            />
          </div>
        )}

        {/* ── PAYMENTS ─────────────────────────────────────────────────────── */}
        {activeTab === "payments" && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{t("tenantDetails.tab.payments")}</h3>
            </div>
            {tenantDisplayPayments.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-500 text-center">
                {t("tenantDetails.noPayments")}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {tenantDisplayPayments.map((pmt) => (
                  <div key={pmt.id} className="flex items-center justify-between px-6 py-3 gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {pmt.description || t("finance.table.rent")}
                      </p>
                      {pmt.dueDate && (
                        <p className="text-xs text-slate-500">{pmt.dueDate}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-slate-900">
                          {formatCurrencyAmount(pmt.amount)}
                        </span>
                        {pmt.originalAmount != null && safeAmount(pmt.originalAmount) !== safeAmount(pmt.amount) ? (
                          <p className="text-xs text-slate-400">
                            {t("tenantDetails.partialCredit", {
                              original: formatCurrencyAmount(pmt.originalAmount),
                              paid: formatCurrencyAmount(pmt.paidAgainstCycle),
                            })}
                          </p>
                        ) : null}
                      </div>
                      <Badge status={pmt.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS ────────────────────────────────────────────────────── */}
        {activeTab === "documents" && (
          <TenantDocumentsSection tenantId={tenant.id} />
        )}

        {/* ── TIMELINE ─────────────────────────────────────────────────────── */}
        {activeTab === "timeline" && (
          <TenantTimelineCard
            accountId={activeAccountId}
            tenant={tenant}
            property={property}
          />
        )}
      </div>
    </>
  );
}
