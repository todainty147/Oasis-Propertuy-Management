// src/components/ActivityLogSection.jsx
import { useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useActivityLog } from "../hooks/useActivityLog";

/* ======================
   LABELS / FORMATTERS
   ====================== */

function fmtDate(value) {
  try {
    return value ? new Date(value).toLocaleString() : "—";
  } catch {
    return "—";
  }
}

function prettyValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function actionLabel(action, t) {
  const a = String(action || "").toLowerCase();
  if (a === "create" || a === "insert") return t("activity.action.created");
  if (a === "update") return t("activity.action.updated");
  if (a === "delete" || a === "deleted") return t("activity.action.deleted");
  if (a === "status_change") return t("activity.action.statusChanged");
  if (a === "assign") return t("activity.action.assigned");
  if (a === "unassign") return t("activity.action.unassigned");
  if (a === "upload") return t("activity.action.fileAdded");
  if (a === "download") return t("activity.action.fileDownloaded");
  return action || "—";
}

function entityLabel(entityType, t) {
  const e = String(entityType || "").toLowerCase();
  if (e === "maintenance_request" || e === "maintenance_requests") return t("activity.entity.request");
  if (e === "work_order" || e === "work_orders") return t("activity.entity.workOrder");
  if (e === "document" || e === "documents") return t("activity.entity.document");
  if (e === "payment" || e === "payments") return t("activity.entity.payment");
  if (e === "property" || e === "properties") return t("activity.entity.property");
  if (e === "tenant" || e === "tenants") return t("activity.entity.tenant");
  return entityType || "—";
}

function pillTone(action) {
  const a = String(action || "").toLowerCase();
  if (a === "delete" || a === "deleted") return "bg-rose-50 border-rose-200 text-rose-700";
  if (a === "create" || a === "insert") return "bg-green-50 border-green-200 text-green-700";
  if (a === "update" || a === "status_change") return "bg-blue-50 border-blue-200 text-blue-700";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

function ActivityPill({ action, t }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${pillTone(action)}`}>
      {actionLabel(action, t)}
    </span>
  );
}

/* ======================
   COMPONENT
   ====================== */

export default function ActivityLogSection({
  // entity scope
  entityType = null,
  entityId = null,

  // ✅ property feed scope
  propertyId = null,

  limit = 20,
  defaultOpen = false,
  title,
  subtitle,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  const { items, loading, error } = useActivityLog({
    enabled: open,
    entityType,
    entityId,
    propertyId, // ✅ pass through
    limit,
  });

  const rows = useMemo(() => items ?? [], [items]);

  const resolvedTitle = title || t("activity.title");
  const resolvedSubtitle = subtitle || t("activity.subtitle");

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{resolvedTitle}</h3>
          <p className="text-sm text-slate-500 mt-1">{resolvedSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-2 text-sm rounded-lg border bg-white hover:bg-slate-50"
        >
          {open ? t("common.hide") : t("common.show")}
        </button>
      </div>

      {open && (
        <>
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {String(error?.message ?? error)}
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <p className="text-sm text-slate-500">{t("activity.empty")}</p>
          )}

          {!loading && rows.length > 0 && (
            <div className="divide-y border rounded-lg bg-white">
              {rows.map((r) => {
                const hasOld = r.old_value !== null && r.old_value !== undefined;
                const hasNew = r.new_value !== null && r.new_value !== undefined;

                return (
                  <div
                    key={r.id}
                    className="px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ActivityPill action={r.action} t={t} />
                        <span className="text-sm font-medium text-slate-900">
                          {entityLabel(r.entity_type, t)}
                        </span>
                        {r.field && (
                          <span className="text-xs text-slate-500">
                            • {t("common.field")}: <b>{r.field}</b>
                          </span>
                        )}
                        {r.actor_role && (
                          <span className="text-xs text-slate-500">
                            • {t("common.role")}: {r.actor_role}
                          </span>
                        )}
                      </div>

                      {(hasOld || hasNew) && (
                        <p className="text-sm text-slate-700 mt-1">
                          {hasOld ? (
                            <>
                              <span className="text-slate-500">{t("activity.from")}:</span>{" "}
                              <b>{prettyValue(r.old_value)}</b>{" "}
                            </>
                          ) : null}
                          {hasNew ? (
                            <>
                              <span className="text-slate-500">→ {t("activity.to")}:</span>{" "}
                              <b>{prettyValue(r.new_value)}</b>
                            </>
                          ) : null}
                        </p>
                      )}

                      {r.meta && Object.keys(r.meta || {}).length > 0 && (
                        <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">
                          {t("common.meta")}: {prettyValue(r.meta)}
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 shrink-0">
                      {fmtDate(r.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
