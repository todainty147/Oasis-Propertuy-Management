import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Home, Wrench, FileText, Wallet } from "lucide-react";

import Card from "../components/Card";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import MaintenanceRequestsSection from "../components/MaintenanceRequestsSection";
import TenantMaintenanceDashboard from "../components/TenantMaintenanceDashboard";
import Skeleton from "../components/ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { formatCurrencyAmount } from "../utils/currency";

function propertyLabel(property) {
  return [property?.address, property?.city].filter(Boolean).join(", ") || "—";
}

function tenantForProperty(tenants, propertyId) {
  return (tenants || []).find((tenant) => String(tenant.propertyId) === String(propertyId)) || null;
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value || "—"}</p>
    </div>
  );
}

export default function TenantPropertyPage({
  loading = false,
  properties = [],
  tenants = [],
  maintenanceOnly = false,
}) {
  const { id } = useParams();
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const maintenanceRef = useRef(null);

  const property = useMemo(() => {
    if (id) return properties.find((row) => String(row.id) === String(id)) || null;
    return properties[0] || null;
  }, [id, properties]);

  const tenant = useMemo(() => tenantForProperty(tenants, property?.id), [tenants, property?.id]);

  useEffect(() => {
    setTitle(maintenanceOnly ? t("tenantPortal.maintenance.title") : t("tenantPortal.shell.nav.homeDetails"));
  }, [maintenanceOnly, setTitle, t]);

  function scrollToRequests() {
    maintenanceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: t("tenantPortal.shell.nav.homeDetails") }]} />
        <Card className="p-6">
          <p className="text-base font-semibold text-[var(--text-primary)]">{t("tenantPortal.homeDetails.emptyTitle")}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("tenantPortal.homeDetails.emptyBody")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs
        items={[{ label: maintenanceOnly ? t("tenantPortal.maintenance.title") : t("tenantPortal.shell.nav.homeDetails") }]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">
            {maintenanceOnly ? t("tenantPortal.maintenance.eyebrow") : t("tenantPortal.homeDetails.eyebrow")}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {maintenanceOnly ? t("tenantPortal.maintenance.title") : t("tenantPortal.homeDetails.title")}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {maintenanceOnly ? t("tenantPortal.maintenance.subtitle") : t("tenantPortal.homeDetails.subtitle")}
          </p>
        </div>

        <button
          type="button"
          onClick={scrollToRequests}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--focus-border)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]"
        >
          <Wrench size={16} aria-hidden="true" />
          {t("tenantPortal.maintenance.reportAction")}
        </button>
      </div>

      {!maintenanceOnly ? (
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="tenaqo-icon-tile mt-1" aria-hidden="true">
                <Home size={20} />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  {t("tenantPortal.homeDetails.addressLabel")}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{propertyLabel(property)}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {t("tenantPortal.homeDetails.accountSafeCopy")}
                </p>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 lg:min-w-[420px]">
              <InfoRow label={t("tenantPortal.homeDetails.cityLabel")} value={property.city} />
              <InfoRow label={t("tenantPortal.homeDetails.rentLabel")} value={formatCurrencyAmount(property.rent || 0)} />
              <InfoRow label={t("tenantPortal.homeDetails.tenantLabel")} value={tenant?.name} />
            </div>
          </div>
        </Card>
      ) : null}

      <TenantMaintenanceDashboard
        propertyId={property.id}
        onOpenRequests={scrollToRequests}
        onOpenWorkOrders={scrollToRequests}
      />

      <div ref={maintenanceRef} className="scroll-mt-6">
        <MaintenanceRequestsSection propertyId={property.id} />
      </div>

      {!maintenanceOnly ? (
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("tenantPortal.home.quickLinks")}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              to="/tenant/documents"
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
            >
              <FileText size={15} className="mr-2 inline" aria-hidden="true" />
              {t("tenantPortal.shell.nav.documents")}
            </Link>
            <Link
              to="/tenant/payments"
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
            >
              <Wallet size={15} className="mr-2 inline" aria-hidden="true" />
              {t("tenantPortal.shell.nav.payments")}
            </Link>
            <Link
              to="/tenant/maintenance"
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
            >
              <Wrench size={15} className="mr-2 inline" aria-hidden="true" />
              {t("tenantPortal.maintenance.title")}
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
