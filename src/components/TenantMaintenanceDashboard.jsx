// src/components/TenantMaintenanceDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { getTenantMaintenanceDashboardData } from "../services/maintenanceService";
import {
  getTenantRequestStatusMeta,
  getTenantWorkOrderStatusMeta,
  summarizeTenantMaintenance,
} from "../utils/tenantPortal";

function pillClass(kind) {
  const base = "text-xs px-2 py-0.5 rounded border";
  if (kind === "ok") return `${base} bg-green-50 border-green-200 text-green-700`;
  if (kind === "warn") return `${base} bg-amber-50 border-amber-200 text-amber-800`;
  if (kind === "info") return `${base} bg-blue-50 border-blue-200 text-blue-700`;
  return `${base} bg-slate-50 border-slate-200 text-slate-600`;
}

function statusKindForTone(tone) {
  if (tone === "green") return "ok";
  if (tone === "amber") return "warn";
  if (tone === "blue") return "info";
  return "muted";
}

function mrStatusLabel(status, t) {
  const meta = getTenantRequestStatusMeta(status);
  return { text: t(meta.labelKey), helper: t(meta.helpKey), kind: statusKindForTone(meta.tone) };
}

function woStatusLabel(status, t) {
  const meta = getTenantWorkOrderStatusMeta(status);
  return { text: t(meta.labelKey), helper: t(meta.helpKey), kind: statusKindForTone(meta.tone) };
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function requestOwnerLabel(status, t) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "resolved" || value === "closed") return t("tenantDashboard.owner.complete");
  return t("tenantDashboard.owner.landlord");
}

function workOrderOwnerLabel(status, t) {
  const value = String(status || "").trim().toLowerCase();
  if (["completed", "cancelled"].includes(value)) return t("tenantDashboard.owner.complete");
  if (["assigned", "in_progress", "blocked"].includes(value)) return t("tenantDashboard.owner.contractor");
  return t("tenantDashboard.owner.landlord");
}

/**
 * TenantMaintenanceDashboard
 * - If propertyId is provided => scoped view for that property
 * - If propertyId is null/undefined => global view across tenant's properties (in active account)
 */
export default function TenantMaintenanceDashboard({
  propertyId = null,
  onOpenRequests,
  onOpenWorkOrders,
  limit = 5,
}) {
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();

  const isTenant = useMemo(
    () => String(activeRole ?? "").toLowerCase() === "tenant",
    [activeRole]
  );

  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const maintenanceSummary = useMemo(
    () => summarizeTenantMaintenance(requests, workOrders),
    [requests, workOrders],
  );

  useEffect(() => {
    if (!isTenant) return;
    if (!activeAccountId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const nextData = await getTenantMaintenanceDashboardData({
          accountId: activeAccountId,
          propertyId,
          limit,
        });

        if (!cancelled) {
          setRequests(nextData.requests || []);
          setWorkOrders(nextData.workOrders || []);
        }
      } catch {
        if (!cancelled) {
          setRequests([]);
          setWorkOrders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isTenant, activeAccountId, propertyId, limit]);

  if (!isTenant) return null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("tenantDashboard.title")}</h3>
          <p className="text-sm text-slate-500">
            {t("tenantDashboard.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenRequests}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t("tenantDashboard.requestsAction")}
          </button>
          <button
            type="button"
            onClick={onOpenWorkOrders}
            className="min-h-[44px] rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            {t("tenantDashboard.workOrdersAction")}
          </button>
        </div>
      </div>

      {!loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("tenantIssues.title")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {maintenanceSummary.activeRequests}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("tenantIssues.activeWorkOrders")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {maintenanceSummary.activeWorkOrders}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("tenantDashboard.resolved")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {maintenanceSummary.resolvedRequests}
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Requests */}
          <div className="border rounded-xl bg-white">
            <div className="p-3 border-b">
              <div className="font-semibold text-slate-900 text-sm">{t("tenantDashboard.latestRequests")}</div>
            </div>
            <div className="p-3 space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-slate-500">{t("maintenance.requests.empty")}</p>
              ) : (
                requests.map((r) => {
                  const st = mrStatusLabel(r.status, t);
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={pillClass(st.kind)}>{st.text}</span>
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {r.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {t("tenantDashboard.createdAt", { value: formatDateTime(r.created_at) })}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t("tenantDashboard.currentlyWith", { value: requestOwnerLabel(r.status, t) })}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {st.helper}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Work orders */}
          <div className="border rounded-xl bg-white">
            <div className="p-3 border-b">
              <div className="font-semibold text-slate-900 text-sm">{t("tenantDashboard.latestWorkOrders")}</div>
            </div>
            <div className="p-3 space-y-3">
              {workOrders.length === 0 ? (
                <p className="text-sm text-slate-500">{t("workOrders.empty")}</p>
              ) : (
                workOrders.map((wo) => {
                  const st = woStatusLabel(wo.status, t);
                  return (
                    <div key={wo.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={pillClass(st.kind)}>{st.text}</span>
                          {wo.pending_cancel_request && (
                            <span className={pillClass("warn")}>{t("tenantDashboard.cancelRequest")}</span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                          {wo.scheduled_at && <span>{t("common.dueDate")}: {formatDateTime(wo.scheduled_at)}</span>}
                          {wo.last_cancel_resolution_action && (
                            <span>
                              {t("tenantDashboard.decision")}:{" "}
                              {String(wo.last_cancel_resolution_action).replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t("tenantDashboard.currentlyWith", { value: workOrderOwnerLabel(wo.status, t) })}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{st.helper}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
