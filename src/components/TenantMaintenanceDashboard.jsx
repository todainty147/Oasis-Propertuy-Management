// src/components/TenantMaintenanceDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useTenant } from "../context/TenantContext";
import { getTenantMaintenanceDashboardData } from "../services/maintenanceService";
import { getTenantTimeline } from "../services/tenantTimelineService";
import {
  buildTenantMaintenanceProgress,
  getTenantRequestStatusMeta,
  getTenantWorkOrderStatusMeta,
  summarizeTenantMaintenance,
} from "../utils/tenantPortal";
import { tenantTimelineCategoryForType } from "../utils/tenantTimelinePresentation";

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

function milestoneDotClass(state) {
  const base = "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold";
  if (state === "complete") return `${base} border-green-300 bg-green-50 text-green-700`;
  if (state === "blocked") return `${base} border-amber-300 bg-amber-50 text-amber-800`;
  if (state === "current") return `${base} border-blue-300 bg-blue-50 text-blue-700`;
  return `${base} border-slate-200 bg-slate-50 text-slate-400`;
}

function milestoneRailClass(state) {
  if (state === "complete") return "bg-green-200";
  if (state === "blocked") return "bg-amber-200";
  if (state === "current") return "bg-blue-200";
  return "bg-slate-200";
}

function milestoneStatusLabel(state, t) {
  if (state === "complete") return t("tenantDashboard.progress.state.complete");
  if (state === "blocked") return t("tenantDashboard.progress.state.waiting");
  if (state === "current") return t("tenantDashboard.progress.state.current");
  return t("tenantDashboard.progress.state.upcoming");
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
  const { activeTenantId } = useTenant();
  const { t } = useI18n();

  const isTenant = useMemo(
    () => String(activeRole ?? "").toLowerCase() === "tenant",
    [activeRole]
  );

  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressEvents, setProgressEvents] = useState([]);
  const maintenanceSummary = useMemo(
    () => summarizeTenantMaintenance(requests, workOrders),
    [requests, workOrders],
  );
  const progressTracker = useMemo(
    () => buildTenantMaintenanceProgress(requests, workOrders),
    [requests, workOrders],
  );

  function formatProgressDetail(event) {
    const parts = [];
    if (event?.detail) parts.push(event.detail);
    if (event?.status) parts.push(t("tenantTimeline.statusWithValue", { value: event.status }));
    return parts.join(" • ");
  }

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

  useEffect(() => {
    if (!isTenant || !activeAccountId || !activeTenantId) {
      setProgressEvents([]);
      return;
    }

    let cancelled = false;

    async function loadProgressEvents() {
      setProgressLoading(true);
      try {
        const result = await getTenantTimeline({
          accountId: activeAccountId,
          tenant: { id: activeTenantId, propertyId },
          property: propertyId ? { id: propertyId } : null,
          limit: 40,
        });
        const maintenanceOnly = (result?.items || [])
          .filter((event) => tenantTimelineCategoryForType(event?.type) === "maintenance")
          .slice(0, 6);
        if (!cancelled) setProgressEvents(maintenanceOnly);
      } catch {
        if (!cancelled) setProgressEvents([]);
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }

    loadProgressEvents();

    return () => {
      cancelled = true;
    };
  }, [isTenant, activeAccountId, activeTenantId, propertyId]);

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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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

      {!loading ? (
        <div
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          data-testid="tenant-maintenance-progress-tracker"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-base font-semibold text-slate-900">
                {t("tenantDashboard.progressTrackerTitle")}
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                {progressTracker.hasItems
                  ? t("tenantDashboard.progressTrackerSubtitle", {
                    value: progressTracker.title || t("tenantDashboard.progress.thisIssue"),
                  })
                  : t("tenantDashboard.progressTrackerEmpty")}
              </p>
            </div>
            {progressTracker.hasItems ? (
              <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {t(progressTracker.currentStepKey)}
              </span>
            ) : null}
          </div>

          {progressTracker.hasItems ? (
            <ol className="grid gap-3 lg:grid-cols-6">
              {progressTracker.milestones.map((milestone, index) => (
                <li key={milestone.key} className="relative flex gap-3 lg:block">
                  <div className="flex flex-col items-center lg:flex-row">
                    <span className={milestoneDotClass(milestone.state)}>
                      {milestone.state === "complete" ? "✓" : index + 1}
                    </span>
                    {index < progressTracker.milestones.length - 1 ? (
                      <span
                        className={`h-full min-h-8 w-px lg:h-px lg:min-h-0 lg:w-full ${milestoneRailClass(milestone.state)}`}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-2 lg:mt-3 lg:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{t(milestone.labelKey)}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {milestoneStatusLabel(milestone.state, t)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t(milestone.bodyKey)}</p>
                    {milestone.at ? (
                      <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(milestone.at)}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {!loading ? (
        <div className="space-y-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">{t("tenantDashboard.progressHistoryTitle")}</h4>
            <p className="mt-1 text-sm text-slate-500">{t("tenantDashboard.progressHistorySubtitle")}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {progressLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : progressEvents.length === 0 ? (
              <p className="text-sm text-slate-500">{t("tenantDashboard.progressHistoryEmpty")}</p>
            ) : (
              <div className="space-y-3">
                {progressEvents.map((event) => (
                  <button
                    key={`progress-${event.key}`}
                    type="button"
                    onClick={propertyId ? onOpenRequests : undefined}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {t(`tenantTimeline.type.${event.type}`) !== `tenantTimeline.type.${event.type}`
                            ? t(`tenantTimeline.type.${event.type}`)
                            : event.title}
                        </p>
                        {formatProgressDetail(event) ? (
                          <p className="mt-1 text-xs text-slate-500">{formatProgressDetail(event)}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">{formatDateTime(event.at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
