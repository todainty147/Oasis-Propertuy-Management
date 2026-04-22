import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAttachmentSignedUrlForRow } from "../../services/workOrderAttachmentsService";
import { getMaintenanceTimelineEvents } from "../../services/maintenanceDashboardService";
import Skeleton from "../ui/Skeleton";
import { useI18n } from "../../context/I18nContext";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function MaintenanceTimeline({
  accountId,
  request,
  linkedWorkOrders = [],
  viewer = "manager",
  propertyId = null,
  maxItems = null,
  showScopeChips = true,
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [busyKey, setBusyKey] = useState("");
  const [scope, setScope] = useState("all");

  useEffect(() => {
    let alive = true;

    async function loadTimeline() {
      if (!accountId || !request?.id) return;
      setLoading(true);
      setError("");

      try {
        const nextEvents = await getMaintenanceTimelineEvents({
          accountId,
          request,
          linkedWorkOrders,
          t,
        });

        if (alive) setEvents(nextEvents);
      } catch (e) {
        if (alive) {
          setError(e?.message || t("maintenance.timeline.loadError"));
          setEvents([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadTimeline();

    return () => {
      alive = false;
    };
  }, [accountId, request, linkedWorkOrders, t]);

  const rows = useMemo(() => {
    const all = events ?? [];
    const filtered =
      scope === "request"
        ? all.filter((e) => e.source === "request")
        : scope === "work_order"
          ? all.filter((e) => e.source === "work_order")
          : all;

    return Number.isFinite(Number(maxItems)) && Number(maxItems) > 0
      ? filtered.slice(-Number(maxItems))
      : filtered;
  }, [events, maxItems, scope]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-rose-700">{error}</p>;
  }

  async function onEventClick(e) {
    if (!e) return;

    if (e.attachmentRow && e.woId) {
      try {
        setBusyKey(e.key);
        const signed = await createAttachmentSignedUrlForRow({
          attachmentRow: e.attachmentRow,
          accountId,
          workOrderId: e.woId,
          expiresIn: 120,
        });
        if (signed) {
          window.open(signed, "_blank", "noopener,noreferrer");
          return;
        }
      } catch {
        // ignore and try WO route fallback
      } finally {
        setBusyKey("");
      }
    }

    if (viewer === "tenant") {
      if (propertyId) navigate(`/properties/${propertyId}`);
      return;
    }

    if (e.woId) {
      navigate(`/work-orders/${e.woId}`);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      {showScopeChips ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`px-2 py-1 text-[11px] rounded border ${
              scope === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {t("maintenance.timeline.scope.all")}
          </button>
          <button
            type="button"
            onClick={() => setScope("request")}
            className={`px-2 py-1 text-[11px] rounded border ${
              scope === "request"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {t("maintenance.timeline.scope.request")}
          </button>
          <button
            type="button"
            onClick={() => setScope("work_order")}
            className={`px-2 py-1 text-[11px] rounded border ${
              scope === "work_order"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {t("maintenance.timeline.scope.workOrder")}
          </button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">{t("maintenance.timeline.empty")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => onEventClick(e)}
              className="w-full text-left flex gap-2 rounded px-1.5 py-1 hover:bg-slate-100"
              title={
                e.attachmentRow
                  ? t("maintenance.timeline.openAttachmentHint")
                  : e.woId
                    ? t("maintenance.timeline.openWorkOrderHint")
                    : ""
              }
            >
              <div className="w-2 pt-1">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-900 font-medium">{e.title}</div>
                {e.detail ? <div className="text-[11px] text-slate-600">{e.detail}</div> : null}
                <div className="text-[11px] text-slate-500">
                  {fmtDate(e.at)}
                  {busyKey === e.key ? ` • ${t("maintenance.timeline.opening")}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
