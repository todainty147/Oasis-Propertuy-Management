import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Skeleton from "../components/ui/Skeleton";
import { Home, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import { getPlanUsageLimit, hasUsageCapacity } from "../lib/entitlements";

/* ======================
   SKELETON
   ====================== */

function PropertiesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px]" />
        ))}
      </div>
    </div>
  );
}

/* ======================
   PROPERTIES
   ====================== */

export default function Properties({
  loading = false,
  properties = [],
  tenants = [],
  onAddProperty,
  onEditProperty,
  onDeleteProperty,
  activePlan = "starter",
}) {
  const { setTitle } = usePageTitle();
  const { accountLoading, activePermissionContext, activeRole, isRootOperator } = useAccount();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [query, setQuery] = useState(() => String(searchParams.get("q") || ""));
  const [sortDir, setSortDir] = useState(() =>
    String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc"
  );

  // Overflow menu state — tracks which card's ⋯ menu is open
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setTitle(t("properties.title"));
  }, [setTitle, t]);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpenId]);

  /* 🔒 ACCESS */
  const canRead   = isRootOperator || can(activePermissionContext, "properties", "read");
  const canCreate = can(activePermissionContext, "properties", "create");
  const canUpdate = can(activePermissionContext, "properties", "update");
  const canDelete = can(activePermissionContext, "properties", "delete");
  const isTenant  = String(activeRole || "").toLowerCase() === "tenant";
  const propertyLimit             = getPlanUsageLimit(activePlan, "properties");
  const propertyCapacityAvailable = hasUsageCapacity(activePlan, "properties", properties.length);
  const addDisabled = canCreate && !propertyCapacityAvailable;

  // --- Filters (URL-synced) ---
  const statusFilter = useMemo(() => {
    const raw = String(searchParams.get("status") || "").toLowerCase();
    if (["vacant", "wolne"].includes(raw)) return "vacant";
    if (["occupied", "wynajete", "wynajęte"].includes(raw)) return "occupied";
    return "";
  }, [searchParams]);

  useEffect(() => {
    const nextQ    = String(searchParams.get("q") || "");
    const nextSort = String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc";
    if (nextQ !== query) setQuery(nextQ);
    if (nextSort !== sortDir) setSortDir(nextSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function updateListParams(next = {}) {
    const params = new URLSearchParams(searchParams);
    if ("q" in next) {
      const v = String(next.q || "").trim();
      if (v) params.set("q", v); else params.delete("q");
    }
    if ("sort" in next) {
      const v = String(next.sort || "").toLowerCase();
      params.set("sort", v === "desc" ? "desc" : "asc");
    }
    if ("status" in next) {
      const v = String(next.status || "").toLowerCase();
      if (v) params.set("status", v); else params.delete("status");
    }
    setSearchParams(params, { replace: true });
  }

  // --- Derived lists ---
  const occupiedSet = useMemo(() => {
    const ids = new Set();
    for (const tenant of tenants || []) {
      if (tenant?.propertyId) ids.add(String(tenant.propertyId));
    }
    return ids;
  }, [tenants]);

  const occupiedCount = useMemo(
    () => (properties || []).filter((p) => occupiedSet.has(String(p.id))).length,
    [properties, occupiedSet],
  );
  const vacantCount = (properties || []).length - occupiedCount;

  const statusFilteredProperties = useMemo(() => {
    if (!statusFilter) return properties || [];
    return (properties || []).filter((p) => {
      const isOccupied = occupiedSet.has(String(p.id));
      return statusFilter === "occupied" ? isOccupied : !isOccupied;
    });
  }, [properties, occupiedSet, statusFilter]);

  const searchableProperties = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return statusFilteredProperties;
    return statusFilteredProperties.filter((p) => {
      const address = String(p?.address || "").toLowerCase();
      const city    = String(p?.city    || "").toLowerCase();
      return address.includes(q) || city.includes(q);
    });
  }, [statusFilteredProperties, query]);

  const visibleProperties = useMemo(() => {
    const copy = [...(searchableProperties || [])];
    copy.sort((a, b) => {
      const av = String(a?.address || "").toLowerCase();
      const bv = String(b?.address || "").toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [searchableProperties, sortDir]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((visibleProperties.length || 0) / (pageSize || 1))),
    [visibleProperties.length, pageSize],
  );

  useEffect(() => { setPage(1); }, [statusFilter, pageSize, query, sortDir]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pagedProperties = useMemo(() => {
    const from = (page - 1) * pageSize;
    return visibleProperties.slice(from, from + pageSize);
  }, [visibleProperties, page, pageSize]);

  // --- Guard renders ---
  if (loading || accountLoading) return <PropertiesSkeleton />;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <DashboardBreadcrumbs items={[{ label: t("properties.title") }]} />
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900">{t("common.noAccess")}</h2>
          <p className="text-sm text-slate-600 mt-1">{t("properties.noAccessBody")}</p>
        </div>
      </div>
    );
  }

  if (statusFilteredProperties.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardBreadcrumbs items={[{ label: t("properties.title") }]} />
        <div className="text-center py-20">
          <h3 className="text-xl font-semibold text-slate-900">
            {isTenant ? t("properties.tenantEmptyTitle") : t("properties.emptyTitle")}
          </h3>
          <p className="text-slate-500 mt-2">
            {isTenant ? t("properties.tenantEmptySubtitle") : t("properties.emptySubtitle")}
          </p>
          {canCreate && (
            <button
              onClick={onAddProperty}
              disabled={addDisabled}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("properties.add")}
            </button>
          )}
          {addDisabled && (
            <p className="mt-3 text-sm text-amber-700">
              {t("properties.limitReached", {
                plan: t(`billing.plan.${activePlan}`),
                count: properties.length,
                limit: propertyLimit,
              })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- Main render ---
  const STATUS_PILLS = [
    { value: "",         label: t("common.all") },
    { value: "occupied", label: t("status.occupied") },
    { value: "vacant",   label: t("status.vacant") },
  ];

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("properties.title") }]} />

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("properties.title")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-slate-900">{properties.length}</span>{" "}
            {t("properties.title").toLowerCase()}
            {" · "}
            <span className="font-medium text-emerald-700">{occupiedCount}</span>{" "}
            {t("status.occupied").toLowerCase()}
            {" · "}
            <span className="font-medium text-slate-600">{vacantCount}</span>{" "}
            {t("status.vacant").toLowerCase()}
          </p>
        </div>

        {canCreate && (
          <button
            onClick={onAddProperty}
            disabled={addDisabled}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("properties.add")}
          </button>
        )}
      </div>

      {addDisabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("properties.limitReached", {
            plan: t(`billing.plan.${activePlan}`),
            count: properties.length,
            limit: propertyLimit,
          })}{" "}
          {t("properties.limitUpgradeHint")}
        </div>
      )}

      <OnboardingHintCard
        title={t("onboarding.hints.properties.title")}
        body={t("onboarding.hints.properties.body")}
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
          placeholder={t("properties.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="flex flex-wrap items-center gap-2">
          {/* Status pills */}
          {STATUS_PILLS.map(({ value, label }) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => updateListParams({ status: value })}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                statusFilter === value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Sort — pushed to the right */}
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

      {visibleProperties.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          {t("properties.noSearchResults")}
        </div>
      )}

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pagedProperties.map((p) => {
          const tenant     = tenants.find((tn) => tn.propertyId === p.id);
          const isOccupied = Boolean(tenant);
          const statusLabel = isOccupied ? t("status.occupied") : t("status.vacant");
          const hasActions  = canUpdate || canDelete;
          const isMenuOpen  = menuOpenId === p.id;

          return (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
            >
              <Card className="relative hover:shadow-md transition-shadow">
                {/* Property image placeholder */}
                <div className="h-28 bg-slate-100 flex items-center justify-center rounded-t-xl">
                  <Home size={36} className="text-slate-300" />
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 leading-snug">{p.address}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{p.city}</p>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-500">{t("finance.table.rent")}</span>
                    <span className="font-semibold text-slate-900">
                      {p.rent != null ? formatCurrencyAmount(p.rent) : "—"}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="text-slate-500">{t("finance.table.tenant")}</span>
                    <span className="text-slate-700">{tenant ? tenant.name : t("common.none")}</span>
                  </div>
                </div>

                {/* Status badge — top left */}
                <div className="absolute top-3 left-3">
                  <Badge status={statusLabel} />
                </div>

                {/* Actions — top right */}
                {hasActions && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {canUpdate && (
                      <button
                        type="button"
                        title={t("properties.edit")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditProperty(p);
                        }}
                        className="rounded-md bg-white/90 p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 shadow-sm border border-slate-200/80"
                      >
                        <Pencil size={14} />
                      </button>
                    )}

                    {canDelete && (
                      <div
                        className="relative"
                        ref={isMenuOpen ? menuRef : null}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpenId(isMenuOpen ? null : p.id);
                          }}
                          className="rounded-md bg-white/90 p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 shadow-sm border border-slate-200/80"
                        >
                          <MoreVertical size={14} />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute top-full right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              disabled={isOccupied}
                              title={
                                isOccupied
                                  ? t("properties.removeTenantBeforeDelete")
                                  : t("properties.deleteProperty")
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMenuOpenId(null);
                                onDeleteProperty(p.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 size={14} />
                              {t("properties.deleteProperty")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {/* PAGINATION */}
      {visibleProperties.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{t("common.perPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {[6, 12, 24].map((n) => (
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
              {t("common.page")}{" "}
              <span className="font-medium text-slate-900">{page}</span>{" "}
              {t("common.of")} {totalPages}
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

      {!canCreate && (
        <p className="text-xs text-slate-500">{t("finance.readOnly")}</p>
      )}
    </div>
  );
}
