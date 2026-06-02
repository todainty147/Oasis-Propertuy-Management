import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Badge from "../components/Badge";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { calculatePropertyFinance } from "../utils/finance";
import PropertyDocumentsSection from "../components/PropertyDocumentsSection";
import MaintenanceRequestsSection from "../components/MaintenanceRequestsSection";
import WorkOrdersSection from "../components/WorkOrdersSection";
import { useAccount } from "../context/AccountContext";
import ActivityLogSection from "../components/ActivityLogSection";
import LeaseSummaryCard from "../components/LeaseSummaryCard";
import PropertyPerformanceCard from "../components/PropertyPerformanceCard";
import PropertyPreventiveMaintenanceCard from "../components/PropertyPreventiveMaintenanceCard";
import PropertyOperatingExpensesCard from "../components/PropertyOperatingExpensesCard";
import PropertyComplianceCard from "../components/PropertyComplianceCard";
import CustomFieldsReadOnlySection from "../components/CustomFieldsReadOnlySection";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";
import { isManageRole, can } from "../utils/permissions";
import { listEntityCustomFieldValues } from "../services/customFieldService";
import { ENTITLEMENT_FEATURES } from "../lib/entitlements";

/* ======================
   SKELETON
   ====================== */

function PropertyDetailsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

/* ======================
   PROPERTY DETAILS
   ====================== */

export default function PropertyDetails({
  loading = false,
  properties = [],
  tenants = [],
  payments = [],
  onEditProperty = null,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setTitle } = usePageTitle();
  const { accountLoading, activeAccountId, activeRole, activePermissionContext, hasEntitlement } = useAccount();
  const { t } = useI18n();
  const canManageLease     = isManageRole(activeRole);
  const canUpdateProperty  = can(activePermissionContext, "properties", "update");
  const [customFieldRows, setCustomFieldRows]     = useState([]);
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);

  const TABS = [
    { id: "overview",    label: t("propertyDetails.tab.overview")       },
    { id: "financials",  label: t("propertyDetails.tab.financials")     },
    { id: "maintenance", label: t("propertyDetails.tab.maintenance")    },
    { id: "compliance",  label: t("propertyDetails.tab.complianceDocs") },
    { id: "activity",    label: t("propertyDetails.tab.activity")       },
  ];
  const VALID_TAB_IDS = new Set(TABS.map((tb) => tb.id));
  const rawTab = searchParams.get("tab");
  const activeTab = (rawTab && VALID_TAB_IDS.has(rawTab)) ? rawTab : "overview";

  function setTab(tab) {
    setSearchParams({ tab }, { replace: true });
  }

  /* ---------- PROPERTY ---------- */
  const property = properties.find((p) => String(p.id) === String(id));

  useEffect(() => {
    if (property?.address) setTitle(property.address);
  }, [property?.address, setTitle]);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomFields() {
      if (!activeAccountId || !property?.id) {
        if (!cancelled) setCustomFieldRows([]);
        return;
      }
      setCustomFieldsLoading(true);
      try {
        const rows = await listEntityCustomFieldValues({
          accountId: activeAccountId,
          entityType: "property",
          entityId: property.id,
        });
        if (!cancelled) setCustomFieldRows(rows);
      } catch {
        if (!cancelled) setCustomFieldRows([]);
      } finally {
        if (!cancelled) setCustomFieldsLoading(false);
      }
    }
    loadCustomFields();
    return () => { cancelled = true; };
  }, [activeAccountId, property?.id]);

  /* ---------- LOADING ---------- */
  if (loading || accountLoading) return <PropertyDetailsSkeleton />;

  /* ---------- NOT FOUND ---------- */
  if (!property) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p>{t("propertyDetails.notFound")}</p>
        <button
          className="mt-4 text-blue-600"
          onClick={() => navigate("/properties")}
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  /* ---------- DERIVED DATA ---------- */
  const propertyTenants  = tenants.filter((tn) => String(tn.propertyId) === String(property.id));
  const isOccupied       = propertyTenants.length > 0;
  const primaryTenant    = propertyTenants[0] || null;
  const propertyPayments = payments.filter((p) => String(p.propertyId) === String(property.id));
  const finance          = calculatePropertyFinance({ property, payments: propertyPayments });
  const ecoPlannerEnabled =
    typeof hasEntitlement === "function" &&
    (hasEntitlement(ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER) ||
      hasEntitlement(ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH_ECO_COMPLIANCE));

  /* ---------- RENDER ---------- */
  return (
    <div className="space-y-4">
      <DashboardBreadcrumbs
        items={[
          { label: t("properties.title"), to: "/properties" },
          { label: property.address },
        ]}
      />

      {/* ── PERSISTENT HEADER ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-slate-900 truncate">
                {property.address}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {property.city}
                {primaryTenant && (
                  <>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="text-slate-700 font-medium">{primaryTenant.name}</span>
                  </>
                )}
                {property.rent != null && (
                  <>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="font-medium text-slate-900">
                      {formatCurrencyAmount(property.rent)}/mo
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {canUpdateProperty && typeof onEditProperty === "function" && (
                <button
                  type="button"
                  onClick={() => onEditProperty(property)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  {t("properties.edit")}
                </button>
              )}
              <Badge status={isOccupied ? t("status.occupied") : t("status.vacant")} />
            </div>
          </div>
        </div>

        {/* ── TAB NAV ────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-100 px-6">
          <nav className="-mb-px flex overflow-x-auto" aria-label="Property sections">
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

      {/* ── TAB CONTENT ──────────────────────────────────────────────────── */}

      {/* Overview: health summary, lease, custom fields */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {canManageLease && (
            <PropertyPerformanceCard
              accountId={activeAccountId}
              property={property}
              payments={propertyPayments}
              tenantCount={propertyTenants.length}
            />
          )}

          <LeaseSummaryCard
            accountId={activeAccountId}
            propertyId={property.id}
            tenantId={primaryTenant?.id || null}
            canManage={canManageLease}
          />

          <CustomFieldsReadOnlySection
            title={t("customFields.propertyFieldsTitle")}
            rows={customFieldRows}
            loading={customFieldsLoading}
          />

          {canManageLease && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{t("propertyDetails.healthContext.title")}</p>
                  <p className="text-sm text-slate-600 mt-1">{t("propertyDetails.healthContext.body")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/portfolio-health")}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white"
                >
                  {t("propertyDetails.healthContext.cta")}
                </button>
              </div>
            </div>
          )}

          {canManageLease && ecoPlannerEnabled && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-emerald-950">EPC & Eco-Upgrade Plan</p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Track EPC profile details, indicative upgrade costs and suggested upgrade paths for landlord review.
                  </p>
                </div>
                <Link
                  to="/portfolio-health/eco-upgrade-planner"
                  className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Open planner
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Financials: key stats + operating expenses */}
      {activeTab === "financials" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{t("finance.table.rent")}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {formatCurrencyAmount(finance.rent)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{t("finance.table.paid")}</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">
                {formatCurrencyAmount(finance.paid)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{t("finance.table.remaining")}</p>
              <p className="text-xl font-bold text-rose-600 mt-1">
                {formatCurrencyAmount(finance.remaining)}
              </p>
            </div>
          </div>

          {canManageLease && (
            <PropertyOperatingExpensesCard
              accountId={activeAccountId}
              propertyId={property.id}
            />
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900">{t("rentPlans.pageTitle")}</p>
              <p className="text-sm text-slate-500 mt-0.5">{t("rentPlans.pageSubtitle")}</p>
            </div>
            <Link
              to={`/finance/rent-plans?property=${property.id}`}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {t("rentPlans.pageTitle")} →
            </Link>
          </div>
        </div>
      )}

      {/* Maintenance: requests + work orders + preventive */}
      {activeTab === "maintenance" && (
        <div className="space-y-4">
          <MaintenanceRequestsSection
            propertyId={property.id}
            accountId={activeAccountId}
          />
          <WorkOrdersSection
            propertyId={property.id}
            accountId={activeAccountId}
          />
          {canManageLease && (
            <PropertyPreventiveMaintenanceCard
              accountId={activeAccountId}
              propertyId={property.id}
            />
          )}
        </div>
      )}

      {/* Compliance & Docs */}
      {activeTab === "compliance" && (
        <div className="space-y-4">
          {canManageLease && (
            <PropertyComplianceCard
              accountId={activeAccountId}
              propertyId={property.id}
            />
          )}
          <PropertyDocumentsSection propertyId={property.id} />
        </div>
      )}

      {/* Activity log */}
      {activeTab === "activity" && (
        <ActivityLogSection
          propertyId={property.id}
          limit={25}
          defaultOpen={true}
        />
      )}
    </div>
  );
}
