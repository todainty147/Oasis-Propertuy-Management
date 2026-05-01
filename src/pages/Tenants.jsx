// src/pages/Tenants.jsx
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Card from "../components/Card";
import Badge from "../components/Badge";
import Skeleton from "../components/ui/Skeleton";

import { usePageTitle } from "../layout/PageTitleContext";
import { useTenants } from "../hooks/useTenants";
import { useProperties } from "../hooks/useProperties";
import { useTenant } from "../context/TenantContext";
import { useAccount } from "../context/AccountContext";
import { can, canCreateTenant, isManageRole } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { listLeases } from "../services/leaseService";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";

// ── Payment status helpers ────────────────────────────────────────────────────
// The DB stores Polish status strings ("Opłacone", "Zaległe"), but we want to
// handle English / German too for multi-locale deployments.

function paymentIsOverdue(p) {
  const s = String(p?.status || "").toLowerCase();
  return s.includes("zaleg") || s === "overdue" || s.includes("fällig");
}

function paymentIsPaid(p) {
  const s = String(p?.status || "").toLowerCase();
  return s.includes("opłac") || s === "paid" || s.includes("bezahl");
}

/* ======================
   SKELETON
   ====================== */

function TenantsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px]" />
        ))}
      </div>
    </div>
  );
}

/* ======================
   TENANTS PAGE
   ====================== */

export default function Tenants({
  loading: propLoading = false,
  tenants: propTenants,
  properties: propProperties,
  payments = [],
}) {
  const { setTitle } = usePageTitle();
  const { activeTenantId } = useTenant();
  const { activePermissionContext, activeAccountId, activeRole, isRootOperator } = useAccount();
  const { t } = useI18n();

  const { tenants: hookTenants, loading: hookLoading, createTenant } = useTenants();
  const { properties: hookProperties } = useProperties();

  // Accept tenants/properties either as props (from ManagerRoutes) or from hooks
  const tenants    = propTenants    ?? hookTenants    ?? [];
  const properties = propProperties ?? hookProperties ?? [];
  const loading    = propLoading    || hookLoading;

  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [query, setQuery]       = useState(() => String(searchParams.get("q")     || ""));
  const [leaseFilter, setLeaseFilter] = useState(() => String(searchParams.get("lease") || "").toLowerCase());
  const [sortDir, setSortDir]   = useState(() =>
    String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc"
  );
  const [leaseRows, setLeaseRows]         = useState([]);
  const [leaseLoading, setLeaseLoading]   = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [tenantSaving, setTenantSaving]   = useState(false);
  const [tenantError, setTenantError]     = useState("");
  const [tenantForm, setTenantForm] = useState({ name: "", email: "", phone: "", propertyId: "" });

  useEffect(() => {
    const nextQ     = String(searchParams.get("q")     || "");
    const nextLease = String(searchParams.get("lease") || "").toLowerCase();
    const nextSort  = String(searchParams.get("sort")  || "").toLowerCase() === "desc" ? "desc" : "asc";
    if (nextQ     !== query)       setQuery(nextQ);
    if (nextLease !== leaseFilter) setLeaseFilter(nextLease);
    if (nextSort  !== sortDir)     setSortDir(nextSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function updateListParams(next = {}) {
    const params = new URLSearchParams(searchParams);
    if ("q" in next) {
      const v = String(next.q || "").trim();
      if (v) params.set("q", v); else params.delete("q");
    }
    if ("sort" in next) {
      params.set("sort", String(next.sort || "").toLowerCase() === "desc" ? "desc" : "asc");
    }
    if ("lease" in next) {
      const v = String(next.lease || "").toLowerCase();
      if (["expiring", "expired", "renewal"].includes(v)) params.set("lease", v);
      else params.delete("lease");
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    let dead = false;
    async function loadLeases() {
      if (!activeAccountId) { setLeaseRows([]); return; }
      setLeaseLoading(true);
      try {
        const rows = await listLeases({ accountId: activeAccountId, limit: 500 });
        if (!dead) setLeaseRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!dead) setLeaseRows([]);
      } finally {
        if (!dead) setLeaseLoading(false);
      }
    }
    loadLeases();
    return () => { dead = true; };
  }, [activeAccountId]);

  useRealtimeTables({
    enabled: !!activeAccountId,
    subscriptions: [
      { channel: `tenants-leases:${activeAccountId}`, table: "leases", filter: `account_id=eq.${activeAccountId}` },
    ],
    onChange: async () => {
      if (!activeAccountId) return;
      try {
        const rows = await listLeases({ accountId: activeAccountId, limit: 500 });
        setLeaseRows(Array.isArray(rows) ? rows : []);
      } catch {
        setLeaseRows([]);
      }
    },
  });

  // Lease filter: tenant IDs matching the selected lease status
  const leaseTenantIds = useMemo(() => {
    const ids = new Set();
    for (const row of leaseRows || []) {
      if (!row?.tenant_id) continue;
      if (leaseFilter === "expiring" && row.derivedStatus === "expiring_soon")       ids.add(String(row.tenant_id));
      if (leaseFilter === "expired"  && row.derivedStatus === "ended")               ids.add(String(row.tenant_id));
      if (leaseFilter === "renewal"  && row.derivedStatus === "renewal_in_progress") ids.add(String(row.tenant_id));
    }
    return ids;
  }, [leaseFilter, leaseRows]);

  // Lease state map: tenant_id → derivedStatus (for card badges)
  const leaseStateByTenant = useMemo(() => {
    const map = new Map();
    for (const row of leaseRows || []) {
      if (row?.tenant_id && row?.derivedStatus) {
        map.set(String(row.tenant_id), row.derivedStatus);
      }
    }
    return map;
  }, [leaseRows]);

  const visibleTenants = useMemo(() => {
    const q    = String(query || "").trim().toLowerCase();
    const base = !leaseFilter
      ? [...(tenants || [])]
      : (tenants || []).filter((tn) => leaseTenantIds.has(String(tn.id)));

    const filtered = !q
      ? base
      : base.filter((tn) => {
          const prop   = properties.find((p) => p.id === tn.propertyId);
          const name   = String(tn?.name    || "").toLowerCase();
          const email  = String(tn?.email   || "").toLowerCase();
          const addr   = String(prop?.address || "").toLowerCase();
          return name.includes(q) || email.includes(q) || addr.includes(q);
        });

    filtered.sort((a, b) => {
      const av = String(a?.name || "").toLowerCase();
      const bv = String(b?.name || "").toLowerCase();
      return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    });
    return filtered;
  }, [tenants, properties, query, sortDir, leaseFilter, leaseTenantIds]);

  const totalPages = Math.max(1, Math.ceil((visibleTenants.length || 0) / (pageSize || 1)));

  useEffect(() => { setPage(1); }, [pageSize, query, sortDir, leaseFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pagedTenants = useMemo(() => {
    const from = (page - 1) * pageSize;
    return visibleTenants.slice(from, from + pageSize);
  }, [visibleTenants, page, pageSize]);

  // Summary stats for the strip
  const expiringCount = useMemo(
    () => leaseRows.filter((r) => r.derivedStatus === "expiring_soon").length,
    [leaseRows],
  );
  const overdueCount = useMemo(
    () => (tenants || []).filter((tn) =>
      payments.some((p) => String(p.tenantId) === String(tn.id) && paymentIsOverdue(p))
    ).length,
    [tenants, payments],
  );

  const canInviteTenant = useMemo(
    () => isManageRole(activeRole, { isRootOperator }) || can(activePermissionContext, "users", "invite") || canCreateTenant(activePermissionContext),
    [activePermissionContext, activeRole, isRootOperator],
  );
  const canAddTenant = useMemo(
    () => isManageRole(activeRole, { isRootOperator }) || canCreateTenant(activePermissionContext),
    [activePermissionContext, activeRole, isRootOperator],
  );
  const canReadTenants = useMemo(() => {
    if (activeRole === "tenant" || activeRole === "contractor") return false;
    return isRootOperator || can(activePermissionContext, "tenants", "read");
  }, [activePermissionContext, activeRole, isRootOperator]);

  useEffect(() => { setTitle(t("sidebar.tenants")); }, [setTitle, t]);

  function resetTenantForm() {
    setTenantForm({ name: "", email: "", phone: "", propertyId: "" });
    setTenantError("");
  }

  async function handleCreateTenant() {
    setTenantSaving(true);
    setTenantError("");
    try {
      const created = await createTenant({
        name:       tenantForm.name,
        email:      tenantForm.email,
        phone:      tenantForm.phone,
        propertyId: tenantForm.propertyId || null,
      });
      setAddTenantOpen(false);
      resetTenantForm();
      if (created?.name) updateListParams({ q: created.name });
    } catch (error) {
      setTenantError(error?.message || t("tenant.createError"));
    } finally {
      setTenantSaving(false);
    }
  }

  // ── Add Tenant modal (light theme) ──────────────────────────────────────────
  const addTenantModal = addTenantOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t("tenant.add")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("tenant.addSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => { setAddTenantOpen(false); resetTenantForm(); }}
            disabled={tenantSaving}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {tenantError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {tenantError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{t("tenant.fullName")}</span>
              <input
                value={tenantForm.name}
                onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value }))}
                disabled={tenantSaving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{t("tenant.email")}</span>
              <input
                type="email"
                value={tenantForm.email}
                onChange={(e) => setTenantForm((f) => ({ ...f, email: e.target.value }))}
                disabled={tenantSaving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{t("tenant.phone")}</span>
              <input
                value={tenantForm.phone}
                onChange={(e) => setTenantForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={tenantSaving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{t("tenant.assignedProperty")}</span>
              <select
                value={tenantForm.propertyId}
                onChange={(e) => setTenantForm((f) => ({ ...f, propertyId: e.target.value }))}
                disabled={tenantSaving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">{t("tenant.noAssignment")}</option>
                {(properties || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}{p.city ? `, ${p.city}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setAddTenantOpen(false); resetTenantForm(); }}
            disabled={tenantSaving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleCreateTenant}
            disabled={tenantSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {tenantSaving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ---------- LOADING ---------- */
  if (loading || leaseLoading) return <TenantsSkeleton />;
  if (!canReadTenants) return <Navigate to="/dashboard" replace />;

  /* ---------- EMPTY ---------- */
  if (tenants.length === 0) {
    return (
      <div className="space-y-6">
        {addTenantModal}
        <DashboardBreadcrumbs items={[{ label: t("sidebar.tenants") }]} />
        <div className="text-center py-20">
          <h3 className="text-xl font-semibold text-slate-900">{t("tenant.emptyTitle")}</h3>
          <p className="text-slate-500 mt-2">
            {activeTenantId ? t("tenant.emptySelectedMissing") : t("tenant.emptyAddFirst")}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {canAddTenant && (
              <button
                type="button"
                onClick={() => setAddTenantOpen(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {t("tenant.add")}
              </button>
            )}
            {canInviteTenant && (
              <Link
                to="/invitations"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("tenant.inviteCta")}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const LEASE_PILLS = [
    { value: "",         label: t("common.all")                      },
    { value: "expiring", label: t("tenant.leaseFilter.expiring")     },
    { value: "expired",  label: t("tenant.leaseFilter.expired")      },
    { value: "renewal",  label: t("tenant.leaseFilter.renewal")      },
  ];

  return (
    <div className="space-y-6">
      {addTenantModal}
      <DashboardBreadcrumbs items={[{ label: t("sidebar.tenants") }]} />

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("sidebar.tenants")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-slate-900">{tenants.length}</span>{" "}
            {t("sidebar.tenants").toLowerCase()}
            {expiringCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-amber-700">{expiringCount}</span>{" "}
                {t("tenant.leaseFilter.expiring").toLowerCase()}
              </>
            )}
            {overdueCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-rose-700">{overdueCount}</span>{" "}
                {t("tenants.paymentOverdue").toLowerCase()}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canAddTenant && (
            <button
              type="button"
              onClick={() => setAddTenantOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("tenant.add")}
            </button>
          )}
          {canInviteTenant && (
            <Link
              to="/invitations"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("tenant.inviteCta")} ↗
            </Link>
          )}
        </div>
      </div>

      <OnboardingHintCard
        title={t("pageHints.tenants.title")}
        body={t("pageHints.tenants.body")}
      />

      {/* FILTER BAR */}
      <div className="space-y-3">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            updateListParams({ q: v });
          }}
          placeholder={t("tenant.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="flex flex-wrap items-center gap-2">
          {LEASE_PILLS.map(({ value, label }) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => {
                setLeaseFilter(value);
                updateListParams({ lease: value });
              }}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                leaseFilter === value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}

          <select
            value={sortDir}
            onChange={(e) => {
              const v = e.target.value === "desc" ? "desc" : "asc";
              setSortDir(v);
              updateListParams({ sort: v });
            }}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1 text-sm focus:outline-none"
            aria-label={t("common.sort")}
          >
            <option value="asc">{t("common.aToZ")}</option>
            <option value="desc">{t("common.zToA")}</option>
          </select>
        </div>
      </div>

      {visibleTenants.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          {t("tenant.noSearchResults")}
        </div>
      )}

      {/* TENANT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pagedTenants.map((tenant) => {
          const property   = properties.find((p) => p.id === tenant.propertyId);
          const tenantPmts = payments.filter((p) => String(p.tenantId) === String(tenant.id));
          const hasOverdue = tenantPmts.some(paymentIsOverdue);
          const hasPaid    = tenantPmts.some(paymentIsPaid);
          const leaseState = leaseStateByTenant.get(String(tenant.id));

          // Payment health indicator
          let paymentDot, paymentLabel;
          if (hasOverdue) {
            paymentDot   = "bg-rose-500";
            paymentLabel = t("tenants.paymentOverdue");
          } else if (hasPaid) {
            paymentDot   = "bg-emerald-500";
            paymentLabel = t("tenants.paymentCurrent");
          } else {
            paymentDot   = "bg-slate-300";
            paymentLabel = t("tenants.paymentNone");
          }

          // Lease state tag
          let leaseBadge = null;
          if (leaseState === "expiring_soon") {
            leaseBadge = (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t("tenants.leaseBadge.expiring")}
              </span>
            );
          } else if (leaseState === "renewal_in_progress") {
            leaseBadge = (
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                {t("tenants.leaseBadge.renewal")}
              </span>
            );
          } else if (leaseState === "ended") {
            leaseBadge = (
              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                {t("tenants.leaseBadge.expired")}
              </span>
            );
          }

          return (
            <Link
              key={tenant.id}
              to={`/tenants/${tenant.id}`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
            >
              <Card className="hover:shadow-md transition-shadow p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{tenant.name}</h3>
                    <p className="text-sm text-slate-500 truncate">{tenant.email ?? "—"}</p>
                  </div>
                  {/* Payment health dot */}
                  <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${paymentDot}`} />
                    <span className={`text-xs font-medium ${hasOverdue ? "text-rose-700" : hasPaid ? "text-emerald-700" : "text-slate-400"}`}>
                      {paymentLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  {property
                    ? `${t("tenant.rents")}: ${property.address}`
                    : t("tenant.noAssignedProperty")}
                  {property?.rent != null && (
                    <span className="ml-2 font-medium text-slate-900">
                      · £{Number(property.rent).toLocaleString()}/mo
                    </span>
                  )}
                </div>

                {leaseBadge && (
                  <div className="mt-2">{leaseBadge}</div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {/* PAGINATION */}
      {visibleTenants.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{t("common.perPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {[8, 16, 24].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t("common.prev")}
            </button>
            <span className="text-sm text-slate-600">
              {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")} {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
