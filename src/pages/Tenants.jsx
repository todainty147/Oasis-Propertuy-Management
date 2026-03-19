// src/pages/Tenants.jsx
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Card from "../components/Card";
import Badge from "../components/Badge";
import Skeleton from "../components/ui/Skeleton";

import { usePageTitle } from "../layout/PageTitleContext";
import { useTenants } from "../hooks/useTenants";
import { useProperties } from "../hooks/useProperties";
import { useTenant } from "../context/TenantContext";
import { useAccount } from "../context/AccountContext";
import { canCreateTenant } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { listLeases } from "../services/leaseService";
import OnboardingHintCard from "../components/OnboardingHintCard";

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

export default function Tenants() {
  const { setTitle } = usePageTitle();
  const { activeTenantId } = useTenant();
  const { activeRole, activeAccountId } = useAccount();
  const { t } = useI18n();

  const { tenants, loading } = useTenants();
  const { properties } = useProperties();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [query, setQuery] = useState(() => String(searchParams.get("q") || ""));
  const [leaseFilter, setLeaseFilter] = useState(() => String(searchParams.get("lease") || "").toLowerCase());
  const [sortDir, setSortDir] = useState(() =>
    String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc"
  );
  const [leaseRows, setLeaseRows] = useState([]);
  const [leaseLoading, setLeaseLoading] = useState(false);

  useEffect(() => {
    const nextQ = String(searchParams.get("q") || "");
    const nextLease = String(searchParams.get("lease") || "").toLowerCase();
    const nextSort =
      String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc";
    if (nextQ !== query) setQuery(nextQ);
    if (nextLease !== leaseFilter) setLeaseFilter(nextLease);
    if (nextSort !== sortDir) setSortDir(nextSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function updateListParams(next = {}) {
    const params = new URLSearchParams(searchParams);
    if (Object.prototype.hasOwnProperty.call(next, "q")) {
      const v = String(next.q || "").trim();
      if (v) params.set("q", v);
      else params.delete("q");
    }
    if (Object.prototype.hasOwnProperty.call(next, "sort")) {
      const v = String(next.sort || "").toLowerCase();
      if (v === "desc") params.set("sort", "desc");
      else params.set("sort", "asc");
    }
    if (Object.prototype.hasOwnProperty.call(next, "lease")) {
      const v = String(next.lease || "").toLowerCase();
      if (["expiring", "expired", "renewal"].includes(v)) params.set("lease", v);
      else params.delete("lease");
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    let dead = false;
    async function loadLeases() {
      if (!activeAccountId) {
        setLeaseRows([]);
        return;
      }
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
    return () => {
      dead = true;
    };
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

  const leaseTenantIds = useMemo(() => {
    const ids = new Set();
    for (const row of leaseRows || []) {
      if (!row?.tenant_id) continue;
      if (leaseFilter === "expiring" && row.derivedStatus === "expiring_soon") ids.add(String(row.tenant_id));
      if (leaseFilter === "expired" && row.derivedStatus === "ended") ids.add(String(row.tenant_id));
      if (leaseFilter === "renewal" && row.derivedStatus === "renewal_in_progress") ids.add(String(row.tenant_id));
    }
    return ids;
  }, [leaseFilter, leaseRows]);

  const visibleTenants = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const base = !leaseFilter
      ? [...(tenants || [])]
      : (tenants || []).filter((tenant) => leaseTenantIds.has(String(tenant.id)));

    const filtered = !q
      ? base
      : base.filter((tenant) => {
          const property = properties.find((p) => p.id === tenant.propertyId);
          const name = String(tenant?.name || "").toLowerCase();
          const email = String(tenant?.email || "").toLowerCase();
          const address = String(property?.address || "").toLowerCase();
          return name.includes(q) || email.includes(q) || address.includes(q);
        });

    filtered.sort((a, b) => {
      const av = String(a?.name || "").toLowerCase();
      const bv = String(b?.name || "").toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return filtered;
  }, [tenants, properties, query, sortDir, leaseFilter, leaseTenantIds]);

  const totalPages = Math.max(1, Math.ceil((visibleTenants.length || 0) / (pageSize || 1)));

  useEffect(() => {
    setPage(1);
  }, [pageSize, query, sortDir, leaseFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pagedTenants = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return visibleTenants.slice(from, to);
  }, [visibleTenants, page, pageSize]);

  useEffect(() => {
    setTitle(t("sidebar.tenants"));
  }, [setTitle, t]);

  /* ---------- LOADING ---------- */
  if (loading || leaseLoading) {
    return <TenantsSkeleton />;
  }

  /* ---------- EMPTY ---------- */
  if (tenants.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          {t("tenant.emptyTitle")}
        </h3>
        <p className="text-slate-500 mt-2">
          {activeTenantId
            ? t("tenant.emptySelectedMissing")
            : t("tenant.emptyAddFirst")}
        </p>

        {canCreateTenant(activeRole) && (
          <Link
            to="/invitations"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {t("tenant.inviteCta")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">
          {t("sidebar.tenants")}
        </h2>

        {canCreateTenant(activeRole) && (
          <Link
            to="/invitations"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {t("tenant.inviteCta")}
          </Link>
        )}
      </div>

      <OnboardingHintCard
        title={t("pageHints.tenants.title")}
        body={t("pageHints.tenants.body")}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            updateListParams({ q: v });
          }}
          placeholder={t("tenant.searchPlaceholder")}
          className="w-full sm:max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={sortDir}
          onChange={(e) => {
            const v = e.target.value === "desc" ? "desc" : "asc";
            setSortDir(v);
            updateListParams({ sort: v });
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          aria-label={t("common.sort")}
        >
          <option value="asc">{t("common.aToZ")}</option>
          <option value="desc">{t("common.zToA")}</option>
        </select>
        <select
          value={leaseFilter}
          onChange={(e) => {
            const v = String(e.target.value || "").toLowerCase();
            setLeaseFilter(v);
            updateListParams({ lease: v });
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          aria-label={t("tenant.leaseFilter")}
        >
          <option value="">{t("tenant.leaseFilter.all")}</option>
          <option value="expiring">{t("tenant.leaseFilter.expiring")}</option>
          <option value="expired">{t("tenant.leaseFilter.expired")}</option>
          <option value="renewal">{t("tenant.leaseFilter.renewal")}</option>
        </select>
      </div>

      {visibleTenants.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          {t("tenant.noSearchResults")}
        </div>
      )}

      {/* TENANT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pagedTenants.map((tenant) => {
          const property = properties.find(
            (p) => p.id === tenant.propertyId
          );

          return (
            <Link
              key={tenant.id}
              to={`/tenants/${tenant.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">
                      {tenant.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {tenant.email ?? "—"}
                    </p>
                  </div>

                  {property && <Badge status={t("status.occupied")} />}
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  {property
                    ? `${t("tenant.rents")}: ${property.address}`
                    : t("tenant.noAssignedProperty")}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

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
                <option key={n} value={n}>
                  {n}
                </option>
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
