// src/pages/Tenants.jsx
import { Link } from "react-router-dom";
import { useEffect } from "react";

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
  const { activeRole } = useAccount();
  const { t } = useI18n();

  const { tenants, loading } = useTenants();
  const { properties } = useProperties();

  useEffect(() => {
    setTitle(t("sidebar.tenants"));
  }, [setTitle, t]);

  /* ---------- LOADING ---------- */
  if (loading) {
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

      {/* TENANT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tenants.map((tenant) => {
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
    </div>
  );
}
