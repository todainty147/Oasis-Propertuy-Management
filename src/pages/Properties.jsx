import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Skeleton from "../components/ui/Skeleton";
import { Home, Pencil, Trash2 } from "lucide-react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";

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
          <Skeleton key={i} className="h-[280px]" />
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
}) {
  const { setTitle } = usePageTitle();
  const { accountLoading, activeRole, isRootOperator } = useAccount();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [query, setQuery] = useState(() => String(searchParams.get("q") || ""));
  const [sortDir, setSortDir] = useState(() =>
    String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc"
  );

  useEffect(() => {
    setTitle(t("properties.title"));
  }, [setTitle, t]);

  if (loading || accountLoading) {
    return <PropertiesSkeleton />;
  }

  /* 🔒 READ ACCESS */
  if (!can(activeRole, "properties", "read")) {
    return (
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900">{t("common.noAccess")}</h2>
        <p className="text-sm text-slate-600 mt-1">
          {t("properties.noAccessBody")}
        </p>
      </div>
    );
  }

  const canCreate = isRootOperator || can(activeRole, "properties", "create");
  const canUpdate = isRootOperator || can(activeRole, "properties", "update");
  const canDelete = isRootOperator || can(activeRole, "properties", "delete");

  const statusFilter = useMemo(() => {
    const raw = String(searchParams.get("status") || "").toLowerCase();
    if (!raw) return "";
    if (["vacant", "wolne"].includes(raw)) return "vacant";
    if (["occupied", "wynajete", "wynajęte"].includes(raw)) return "occupied";
    return "";
  }, [searchParams]);

  useEffect(() => {
    const nextQ = String(searchParams.get("q") || "");
    const nextSort =
      String(searchParams.get("sort") || "").toLowerCase() === "desc" ? "desc" : "asc";
    if (nextQ !== query) setQuery(nextQ);
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
    setSearchParams(params, { replace: true });
  }

  const occupiedSet = useMemo(() => {
    const ids = new Set();
    for (const tenant of tenants || []) {
      if (tenant?.propertyId) ids.add(String(tenant.propertyId));
    }
    return ids;
  }, [tenants]);

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
      const city = String(p?.city || "").toLowerCase();
      const size = String(p?.size || "").toLowerCase();
      return address.includes(q) || city.includes(q) || size.includes(q);
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
    [visibleProperties.length, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize, query, sortDir]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pagedProperties = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return visibleProperties.slice(from, to);
  }, [visibleProperties, page, pageSize]);

  if (statusFilteredProperties.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          {t("properties.emptyTitle")}
        </h3>
        <p className="text-slate-500 mt-2">
          {t("properties.emptySubtitle")}
        </p>

        {canCreate && (
          <button
            onClick={onAddProperty}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {t("properties.add")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">{t("properties.title")}</h2>

        {canCreate && (
          <button
            onClick={onAddProperty}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {t("properties.add")}
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            updateListParams({ q: v });
          }}
          placeholder={t("properties.searchPlaceholder")}
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
      </div>

      {visibleProperties.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          {t("properties.noSearchResults")}
        </div>
      )}

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pagedProperties.map((p) => {
          // ✅ SINGLE SOURCE OF TRUTH
          const tenant = tenants.find(
            (t) => t.propertyId === p.id
          );

          const isOccupied = Boolean(tenant);
          const statusLabel = isOccupied ? t("status.occupied") : t("status.vacant");

          return (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
            >
              <Card className="relative hover:shadow-md transition-shadow">
                <div className="h-32 bg-slate-100 flex items-center justify-center">
                  <Home size={40} className="text-slate-300" />
                </div>

                <div className="p-5">
                  <h3 className="font-semibold">{p.address}</h3>
                  <p className="text-sm text-slate-500">
                    {p.city} • {p.size}
                  </p>

                  <div className="mt-3 flex justify-between text-sm">
                    <span>{t("finance.table.rent")}</span>
                    <span className="font-medium">
                      {p.rent != null ? formatCurrencyAmount(p.rent) : "—"}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between text-sm">
                    <span>{t("finance.table.tenant")}</span>
                    <span>{tenant ? tenant.name : t("common.none")}</span>
                  </div>
                </div>

                {/* STATUS */}
                <div className="absolute top-3 left-3">
                  <Badge status={statusLabel} />
                </div>

                {/* ACTIONS */}
                {(canUpdate || canDelete) && (
                  <div className="absolute top-3 right-3 flex gap-2">
                    {canUpdate && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditProperty(p);
                        }}
                        className="p-1 bg-white rounded hover:bg-slate-100"
                      >
                        <Pencil size={16} />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        disabled={isOccupied}
                        title={
                          isOccupied
                            ? t("properties.removeTenantBeforeDelete")
                            : t("properties.deleteProperty")
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteProperty(p.id);
                        }}
                        className={`p-1 rounded ${
                          isOccupied
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-white hover:bg-slate-100"
                        }`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

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

      {!canCreate && (
        <p className="text-xs text-slate-500">
          {t("finance.readOnly")}
        </p>
      )}
    </div>
  );
}
