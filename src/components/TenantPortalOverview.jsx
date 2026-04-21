import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Wrench,
} from "lucide-react";

import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useNotifications } from "../hooks/useNotifications";
import { fetchDocuments } from "../services/documentService";
import { getTenantMaintenanceDashboardData } from "../services/maintenanceService";
import { formatCurrencyAmount } from "../utils/currency";
import { localizeNotificationContent } from "../utils/notificationLocalization";
import {
  buildTenantPaymentSummary,
  partitionTenantDocuments,
  summarizeTenantMaintenance,
} from "../utils/tenantPortal";

function formatDateTime(value) {
  if (!value) return "";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "";
  return next.toLocaleString();
}

function SummaryCard({ icon, label, value, helper, tone = "slate" }) {
  const IconComponent = icon;
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {helper ? <p className="mt-2 text-sm text-slate-600">{helper}</p> : null}
        </div>
        <div className={`rounded-lg border p-2 ${tones[tone] || tones.slate}`}>
          <IconComponent size={18} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, tone = "primary" }) {
  const className =
    tone === "secondary"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      : "bg-slate-900 text-white hover:bg-slate-800";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition ${className}`}
    >
      {label}
    </button>
  );
}

function statusTone(severity) {
  if (severity === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "action") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function severityLabelKey(severity) {
  if (severity === "urgent") return "tenantPortal.actionCenter.urgent";
  if (severity === "action") return "tenantPortal.actionCenter.action";
  return "tenantPortal.actionCenter.info";
}

export default function TenantPortalOverview({
  accountId,
  tenantId,
  propertyId = null,
  snapshot = null,
  payments = [],
  onOpenPayments,
  onOpenRequests,
  onOpenDocuments,
}) {
  const { t } = useI18n();
  const { items: notificationItems, unreadCount, loading: notificationsLoading } = useNotifications({
    limit: 8,
    accountId,
  });

  const [maintenanceBundle, setMaintenanceBundle] = useState({
    requests: [],
    workOrders: [],
  });
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPortalData() {
      if (!accountId) {
        if (!cancelled) {
          setMaintenanceBundle({ requests: [], workOrders: [] });
          setDocuments([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const [maintenanceData, documentRows] = await Promise.all([
          getTenantMaintenanceDashboardData({
            accountId,
            propertyId,
            limit: 10,
          }),
          fetchDocuments({
            accountId,
            tenantId: tenantId || null,
          }),
        ]);

        if (!cancelled) {
          setMaintenanceBundle({
            requests: maintenanceData?.requests || [],
            workOrders: maintenanceData?.workOrders || [],
          });
          setDocuments(documentRows || []);
        }
      } catch {
        if (!cancelled) {
          setMaintenanceBundle({ requests: [], workOrders: [] });
          setDocuments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPortalData();
    return () => {
      cancelled = true;
    };
  }, [accountId, propertyId, tenantId]);

  const paymentSummary = useMemo(
    () => buildTenantPaymentSummary(snapshot || {}, payments || []),
    [payments, snapshot],
  );
  const maintenanceSummary = useMemo(
    () => summarizeTenantMaintenance(maintenanceBundle.requests, maintenanceBundle.workOrders),
    [maintenanceBundle.requests, maintenanceBundle.workOrders],
  );
  const documentGroups = useMemo(
    () => partitionTenantDocuments(documents),
    [documents],
  );
  const recentNotifications = useMemo(
    () => (notificationItems || []).slice(0, 3).map((item) => localizeNotificationContent(item, t)),
    [notificationItems, t],
  );

  const attentionItems = useMemo(() => {
    const items = [];

    if (paymentSummary.overdue > 0) {
      items.push({
        key: "overdue",
        severity: "urgent",
        title: t("tenantPortal.action.overdue.title"),
        body: t("tenantPortal.action.overdue.body", {
          value: formatCurrencyAmount(paymentSummary.overdue),
        }),
        action: t("tenantPortal.action.viewPayments"),
        onClick: onOpenPayments,
      });
    } else if (paymentSummary.outstanding > 0) {
      items.push({
        key: "due",
        severity: "action",
        title: t("tenantPortal.action.due.title"),
        body: t("tenantPortal.action.due.body", {
          value: formatCurrencyAmount(paymentSummary.outstanding),
        }),
        action: t("tenantPortal.action.viewPayments"),
        onClick: onOpenPayments,
      });
    }

    if (maintenanceSummary.activeRequests > 0 || maintenanceSummary.activeWorkOrders > 0) {
      items.push({
        key: "maintenance",
        severity: "action",
        title: t("tenantPortal.action.maintenance.title"),
        body: t("tenantPortal.action.maintenance.body", {
          requests: maintenanceSummary.activeRequests,
          workOrders: maintenanceSummary.activeWorkOrders,
        }),
        action: t("tenantPortal.action.trackRequests"),
        onClick: onOpenRequests,
      });
    }

    if (unreadCount > 0) {
      items.push({
        key: "notifications",
        severity: "info",
        title: t("tenantPortal.action.notifications.title"),
        body: t("tenantPortal.action.notifications.body", { count: unreadCount }),
        action: "",
        onClick: null,
      });
    }

    if (documentGroups.total > 0) {
      items.push({
        key: "documents",
        severity: "info",
        title: t("tenantPortal.action.documents.title"),
        body: t("tenantPortal.action.documents.body", { count: documentGroups.total }),
        action: t("tenantPortal.action.openDocuments"),
        onClick: onOpenDocuments,
      });
    }

    return items;
  }, [
    documentGroups.total,
    maintenanceSummary.activeRequests,
    maintenanceSummary.activeWorkOrders,
    onOpenDocuments,
    onOpenPayments,
    onOpenRequests,
    paymentSummary.outstanding,
    paymentSummary.overdue,
    t,
    unreadCount,
  ]);

  const paymentHelper =
    paymentSummary.state === "overdue"
      ? t("tenantPortal.payment.helper.overdue")
      : paymentSummary.state === "due"
        ? t("tenantPortal.payment.helper.due")
        : t("tenantPortal.payment.helper.clear");

  const homeHelper =
    maintenanceSummary.activeRequests > 0 || maintenanceSummary.activeWorkOrders > 0
      ? t("tenantPortal.home.helper.active")
      : t("tenantPortal.home.helper.quiet");

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{t("tenantPortal.overview.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("tenantPortal.overview.subtitle")}</p>
        </div>

        <div className="p-5 space-y-5">
          {(loading || notificationsLoading) ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  icon={paymentSummary.overdue > 0 ? AlertCircle : CheckCircle2}
                  label={t("tenantPortal.card.payments")}
                  value={formatCurrencyAmount(paymentSummary.outstanding)}
                  helper={paymentHelper}
                  tone={paymentSummary.overdue > 0 ? "rose" : paymentSummary.outstanding > 0 ? "amber" : "green"}
                />
                <SummaryCard
                  icon={Wrench}
                  label={t("tenantPortal.card.maintenance")}
                  value={String(maintenanceSummary.activeRequests + maintenanceSummary.activeWorkOrders)}
                  helper={homeHelper}
                  tone={maintenanceSummary.activeRequests + maintenanceSummary.activeWorkOrders > 0 ? "blue" : "green"}
                />
                <SummaryCard
                  icon={Bell}
                  label={t("tenantPortal.card.updates")}
                  value={String(unreadCount)}
                  helper={unreadCount > 0 ? t("tenantPortal.updates.helper.unread") : t("tenantPortal.updates.helper.clear")}
                  tone={unreadCount > 0 ? "amber" : "slate"}
                />
                <SummaryCard
                  icon={FileText}
                  label={t("tenantPortal.card.documents")}
                  value={String(documentGroups.total)}
                  helper={documentGroups.recent.length > 0 ? t("tenantPortal.documents.helper.recent") : t("tenantPortal.documents.helper.available")}
                  tone={documentGroups.total > 0 ? "slate" : "green"}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <ActionButton label={t("tenantPortal.action.viewPayments")} onClick={onOpenPayments} />
                <ActionButton label={t("tenantPortal.action.trackRequests")} onClick={onOpenRequests} tone="secondary" />
                <ActionButton label={t("tenantPortal.action.openDocuments")} onClick={onOpenDocuments} tone="secondary" />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{t("tenantPortal.actionCenter.title")}</h3>
                      <p className="mt-1 text-sm text-slate-500">{t("tenantPortal.actionCenter.subtitle")}</p>
                    </div>
                    <Clock3 className="text-slate-400" size={18} />
                  </div>

                  <div className="mt-4 space-y-3">
                    {attentionItems.length === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        {t("tenantPortal.actionCenter.empty")}
                      </div>
                    ) : (
                      attentionItems.map((item) => (
                        <div key={item.key} className="rounded-lg border border-slate-200 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusTone(item.severity)}`}>
                                {t(severityLabelKey(item.severity))}
                              </div>
                              <p className="mt-2 text-sm font-medium text-slate-900">{item.title}</p>
                              <p className="mt-1 text-sm text-slate-600">{item.body}</p>
                            </div>
                            {item.action && item.onClick ? (
                              <button
                                type="button"
                                onClick={item.onClick}
                                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                {item.action}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-slate-900">{t("tenantPortal.updates.title")}</h3>
                    <div className="mt-3 space-y-3">
                      {recentNotifications.length === 0 ? (
                        <p className="text-sm text-slate-500">{t("tenantPortal.updates.empty")}</p>
                      ) : (
                        recentNotifications.map((item, index) => (
                          <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-200 px-3 py-3">
                            <p className="text-sm font-medium text-slate-900">{item.title}</p>
                            {item.body ? <p className="mt-1 text-sm text-slate-600">{item.body}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-slate-900">{t("tenantPortal.documents.title")}</h3>
                    <p className="mt-1 text-sm text-slate-500">{t("tenantPortal.documents.subtitle")}</p>
                    <div className="mt-3 space-y-3">
                      {documentGroups.total === 0 ? (
                        <p className="text-sm text-slate-500">{t("tenantPortal.documents.empty")}</p>
                      ) : (
                        (documentGroups.recent.length > 0 ? documentGroups.recent : documentGroups.older)
                          .slice(0, 3)
                          .map((doc) => (
                          <div key={doc.id} className="rounded-lg border border-slate-200 px-3 py-3">
                            <p className="text-sm font-medium text-slate-900">
                              {doc.original_filename || doc.name || t("documents.tenantTitle")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDateTime(doc.created_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
