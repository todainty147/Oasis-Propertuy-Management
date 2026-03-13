import { Link } from "react-router-dom";
import { useEffect } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Skeleton from "../components/ui/Skeleton";
import { Home, Pencil, Trash2 } from "lucide-react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";

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
  const { accountLoading, activeRole } = useAccount();
  const { t } = useI18n();

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

  const canCreate = can(activeRole, "properties", "create");
  const canUpdate = can(activeRole, "properties", "update");
  const canDelete = can(activeRole, "properties", "delete");

  if (properties.length === 0) {
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

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((p) => {
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
                      {p.rent != null ? `${p.rent} PLN` : "—"}
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

      {!canCreate && (
        <p className="text-xs text-slate-500">
          {t("finance.readOnly")}
        </p>
      )}
    </div>
  );
}
