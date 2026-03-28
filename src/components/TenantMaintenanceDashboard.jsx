// src/components/TenantMaintenanceDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { getTenantMaintenanceDashboardData } from "../services/maintenanceService";

function pillClass(kind) {
  const base = "text-xs px-2 py-0.5 rounded border";
  if (kind === "ok") return `${base} bg-green-50 border-green-200 text-green-700`;
  if (kind === "warn") return `${base} bg-amber-50 border-amber-200 text-amber-800`;
  if (kind === "info") return `${base} bg-blue-50 border-blue-200 text-blue-700`;
  return `${base} bg-slate-50 border-slate-200 text-slate-600`;
}

function mrStatusLabel(status, t) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return { text: t("status.req.open"), kind: "warn" };
  if (s === "in_progress") return { text: t("status.req.in_progress"), kind: "info" };
  if (s === "waiting") return { text: t("status.req.waiting"), kind: "muted" };
  if (s === "resolved") return { text: t("status.req.resolved"), kind: "ok" };
  if (s === "closed") return { text: t("status.req.closed"), kind: "ok" };
  return { text: status ?? "—", kind: "muted" };
}

function woStatusLabel(status, t) {
  const s = String(status ?? "").toLowerCase();
  if (s === "assigned") return { text: t("maintenance.workOrderStatus.assigned"), kind: "warn" };
  if (s === "in_progress") return { text: t("maintenance.workOrderStatus.inProgress"), kind: "info" };
  if (s === "completed") return { text: t("maintenance.workOrderStatus.completed"), kind: "ok" };
  if (s === "blocked") return { text: t("workOrder.blocked"), kind: "muted" };
  if (s === "cancelled") return { text: t("maintenance.workOrderStatus.cancelled"), kind: "muted" };
  return { text: `${t("workOrder.shortLabel")}: ${status ?? "—"}`, kind: "muted" };
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("tenantDashboard.title")}</h3>
          <p className="text-sm text-slate-500">
            {t("tenantDashboard.subtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenRequests}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
          >
            {t("tenantDashboard.requestsAction")}
          </button>
          <button
            type="button"
            onClick={onOpenWorkOrders}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
          >
            {t("tenantDashboard.workOrdersAction")}
          </button>
        </div>
      </div>

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
                              Decyzja:{" "}
                              {String(wo.last_cancel_resolution_action).replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
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
