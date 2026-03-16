import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";

/* -----------------------------
   UI helpers
----------------------------- */

function StatusPill({ status, t }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(status ?? "").trim().toLowerCase();
  const normalized =
    ["przypisane"].includes(s) ? "assigned" :
    ["w trakcie", "in progress"].includes(s) ? "in_progress" :
    ["zakończone", "zakonczone"].includes(s) ? "completed" :
    ["anulowane"].includes(s) ? "cancelled" :
    ["zablokowane"].includes(s) ? "blocked" :
    s;

  if (normalized === "completed")
    return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>{t("status.wo.completed")}</span>;
  if (normalized === "in_progress")
    return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>{t("status.wo.in_progress")}</span>;
  if (normalized === "cancelled")
    return <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>{t("status.wo.cancelled")}</span>;
  if (normalized === "blocked")
    return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{t("workOrder.blocked")}</span>;
  return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{t("status.wo.assigned")}</span>;
}

function statusAccentClass(status) {
  const s = String(status ?? "").trim().toLowerCase();
  const normalized =
    ["przypisane"].includes(s) ? "assigned" :
    ["w trakcie", "in progress"].includes(s) ? "in_progress" :
    ["zakończone", "zakonczone"].includes(s) ? "completed" :
    ["anulowane"].includes(s) ? "cancelled" :
    ["zablokowane"].includes(s) ? "blocked" :
    s;
  if (normalized === "completed") return "border-l-green-500";
  if (normalized === "in_progress") return "border-l-blue-500";
  if (normalized === "cancelled") return "border-l-slate-400";
  if (normalized === "blocked") return "border-l-amber-500";
  return "border-l-indigo-500";
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function PriorityPill({ priority, t }) {
  const p = String(priority || "normal").trim().toLowerCase();
  const normalized =
    ["niski"].includes(p) ? "low" :
    ["normalny"].includes(p) ? "normal" :
    ["wysoki"].includes(p) ? "high" :
    ["pilny"].includes(p) ? "urgent" :
    ["krytyczny"].includes(p) ? "critical" :
    p;
  const base = "text-[11px] px-2 py-0.5 rounded border";
  if (normalized === "critical") return <span className={`${base} bg-rose-100 border-rose-300 text-rose-700`}>{t("priority.critical")}</span>;
  if (normalized === "urgent") return <span className={`${base} bg-orange-100 border-orange-300 text-orange-700`}>{t("priority.urgent")}</span>;
  if (normalized === "high") return <span className={`${base} bg-orange-100 border-orange-300 text-orange-700`}>{t("priority.high")}</span>;
  return <span className={`${base} bg-slate-100 border-slate-200 text-slate-700`}>{t("priority.normal")}</span>;
}

function shortText(v, max = 120) {
  const txt = String(v || "").trim();
  if (!txt) return "";
  if (txt.length <= max) return txt;
  return `${txt.slice(0, max - 1)}…`;
}

function deriveJobTitle(wo, t) {
  const title = String(wo?.issueTitle || "").trim();
  if (title) return title;
  const fromNotes = String(wo?.issueDescription || wo?.notes || "").trim();
  if (!fromNotes) return t("workOrders.serviceOrder");
  const firstLine = fromNotes.split("\n").find((x) => String(x || "").trim());
  return shortText(firstLine || fromNotes, 56);
}

/* -----------------------------
   Page
----------------------------- */

export default function ContractorPortal() {
  const { setTitle } = usePageTitle();
  const { activeRole } = useAccount();
  const { t } = useI18n();
  const navigate = useNavigate();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [allowedById, setAllowedById] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setTitle("Portal wykonawcy");
  }, [setTitle]);

  async function load() {
    setLoading(true);
    try {
      // Prefer richer view first (may include related data depending on RLS/view grants)
      let list = [];
      const baseSelect = `
        id,
        account_id,
        property_id,
        maintenance_request_id,
        contractor_user_id,
        contractor_name,
        contractor_phone,
        status,
        scheduled_at,
        notes,
        created_at,
        updated_at,
        maintenance_requests:maintenance_request_id ( id, title, description, priority ),
        properties:property_id ( id, address, city )
      `;

      const { data: fromView, error: fromViewErr } = await supabase
        .from("work_orders_with_flags")
        .select(baseSelect)
        .order("created_at", { ascending: false });

      if (fromViewErr) {
        const { data: fallbackRows, error: fallbackErr } = await supabase
          .from("work_orders")
          .select(
            `
            id,
            account_id,
            property_id,
            maintenance_request_id,
            contractor_user_id,
            contractor_name,
            contractor_phone,
            status,
            scheduled_at,
            notes,
            created_at,
            updated_at
          `
          )
          .order("created_at", { ascending: false });
        if (fallbackErr) throw fallbackErr;
        list = fallbackRows ?? [];
      } else {
        list = fromView ?? [];
      }

      const requestIds = list.map((x) => x.maintenance_request_id).filter(Boolean);
      const propertyIds = list.map((x) => x.property_id).filter(Boolean);

      let reqById = {};
      let propById = {};

      if (requestIds.length > 0) {
        const { data: reqRows } = await supabase
          .from("maintenance_requests")
          .select("id, property_id, title, description, priority")
          .in("id", requestIds);
        reqById = Object.fromEntries((reqRows || []).map((r) => [r.id, r]));
      }

      if (propertyIds.length > 0) {
        const { data: propRows } = await supabase
          .from("properties")
          .select("id, address, city")
          .in("id", propertyIds);
        propById = Object.fromEntries((propRows || []).map((p) => [p.id, p]));
      }

      const hydrated = list.map((wo) => {
        const req = wo.maintenance_requests || reqById[wo.maintenance_request_id] || null;
        const prop = wo.properties || propById[wo.property_id] || null;
        return {
          ...wo,
          issueTitle: req?.title || "",
          issueDescription: req?.description || "",
          issuePriority: req?.priority || "normal",
          propertyLabel: prop ? `${prop.address || t("common.property")}${prop.city ? `, ${prop.city}` : ""}` : t("common.property"),
        };
      });

      let merged = hydrated;
      const missing = hydrated.some(
        (x) =>
          !String(x.propertyLabel || "").trim() ||
          String(x.propertyLabel || "").trim().toLowerCase() === String(t("common.property")).trim().toLowerCase() ||
          !String(x.issueTitle || "").trim()
      );

      if (missing) {
        try {
          const { data: cardRows, error: cardErr } = await supabase.rpc("contractor_work_order_cards", {
            p_work_order_ids: hydrated.map((x) => x.id).filter(Boolean),
          });
          if (!cardErr && Array.isArray(cardRows)) {
            const byId = Object.fromEntries(cardRows.map((r) => [r.work_order_id, r]));
            merged = hydrated.map((wo) => {
              const extra = byId[wo.id];
              if (!extra) return wo;
              return {
                ...wo,
                issueTitle: String(extra.issue_title || "").trim() || wo.issueTitle,
                issueDescription:
                  String(extra.issue_description || "").trim() || wo.issueDescription,
                issuePriority: String(extra.issue_priority || "").trim() || wo.issuePriority,
                propertyLabel: String(extra.property_label || "").trim() || wo.propertyLabel,
              };
            });
          }
        } catch {
          // Optional fallback RPC; ignore when not deployed yet.
        }
      }

      setRows(merged);

      // Optional: allowed actions per row
      const ids = list.map((x) => x.id).filter(Boolean);
      const pairs = await Promise.all(
        ids.map(async (id) => {
          const { data: a, error: e } = await supabase.rpc("contractor_allowed_actions", {
            p_work_order_id: id,
          });
          if (e) return [id, []];
          return [id, Array.isArray(a) ? a : []];
        })
      );
      setAllowedById(Object.fromEntries(pairs));
    } catch (e) {
      console.error(e);
      setRows([]);
      setAllowedById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeTables({
    enabled: isContractor,
    subscriptions: [
      { channel: "contractor-portal-work-orders", table: "work_orders" },
      { channel: "contractor-portal-requests", table: "maintenance_requests" },
      { channel: "contractor-portal-financials", table: "work_order_financials" },
    ],
    onChange: load,
  });

  async function updateWorkOrder(id, patch) {
    setSavingId(id);
    try {
      // SECURITY DEFINER RPC (your existing contractor flow)
      const { error } = await supabase.rpc("contractor_update_work_order", {
        p_work_order_id: id,
        p_status: patch.status ?? null,
        p_notes: patch.notes ?? null,
        p_scheduled_at: patch.scheduled_at ?? null,
      });
      if (error) throw error;

      await load();
    } catch (e) {
      alert(e?.message ?? t("workOrders.updateError"));
    } finally {
      setSavingId(null);
    }
  }

  function openDetails(id) {
    if (!id) return;
    navigate(`/contractor/jobs/${id}`);
  }

  if (!isContractor) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">
          {t("contractor.onlyAccess")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("sidebar.contractorPortal")}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {t("contractor.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
          >
            {t("common.refresh")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { key: "all", label: t("contractor.filter.all") },
            { key: "assigned", label: t("status.wo.assigned") },
            { key: "in_progress", label: t("status.wo.in_progress") },
            { key: "completed", label: t("status.wo.completed") },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full border ${
                statusFilter === f.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : rows.filter((wo) => statusFilter === "all" || ["przypisane"].includes(String(wo.status || "").trim().toLowerCase()) && statusFilter === "assigned" || ["w trakcie", "in progress"].includes(String(wo.status || "").trim().toLowerCase()) && statusFilter === "in_progress" || ["zakończone", "zakonczone"].includes(String(wo.status || "").trim().toLowerCase()) && statusFilter === "completed" || String(wo.status || "").trim().toLowerCase() === statusFilter).length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate-600">{t("contractor.emptyAssignments")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows
            .filter((wo) => statusFilter === "all" || ["przypisane"].includes(String(wo.status || "").trim().toLowerCase()) && statusFilter === "assigned" || ["w trakcie", "in progress"].includes(String(wo.status || "").trim().toLowerCase()) && statusFilter === "in_progress" || ["zakończone", "zakonczone"].includes(String(wo.status || "").trim().toLowerCase()) && statusFilter === "completed" || String(wo.status || "").trim().toLowerCase() === statusFilter)
            .map((wo) => {
            const isBusy = savingId === wo.id;
            const allowed = allowedById[wo.id] ?? [];
            const accent = statusAccentClass(wo.status);

            return (
              <div
                key={wo.id}
                className={`p-4 border rounded-xl border-l-4 ${accent} bg-white hover:bg-slate-50 cursor-pointer`}
                role="button"
                tabIndex={0}
                onClick={() => openDetails(wo.id)}
                onDoubleClick={() => openDetails(wo.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetails(wo.id);
                }}
              >
                <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {deriveJobTitle(wo, t)}
                      </p>
                      <p className="mt-1 text-xs text-slate-700 font-medium truncate">
                        {wo.propertyLabel || t("common.property")}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <StatusPill status={wo.status} t={t} />
                      <PriorityPill priority={wo.issuePriority} t={t} />
                    </div>
                  </div>

                  {wo.contractor_phone && (
                    <div className="mt-2 text-xs text-slate-500">{t("common.phone")}: {wo.contractor_phone}</div>
                  )}
                  <div className="mt-2 text-xs text-slate-500">
                    {t("common.dueDate")}: {formatDateTime(wo.scheduled_at)} • {t("common.createdAt")}: {formatDateTime(wo.created_at)}
                  </div>

                  <div className="mt-3 text-sm text-slate-700 line-clamp-2">
                    {shortText(wo.issueDescription || wo.notes, 160) || t("workOrders.noIssueDescription")}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {allowed.includes("in_progress") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "in_progress" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-blue-700 border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        {t("workOrders.startWork")}
                      </button>
                    )}

                    {allowed.includes("blocked") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "blocked" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-amber-700 border-amber-200 hover:bg-amber-50"
                        }`}
                      >
                        {t("workOrder.blocked")}
                      </button>
                    )}

                    {allowed.includes("completed") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "completed" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-green-700 border-green-200 hover:bg-green-50"
                        }`}
                      >
                        {t("workOrders.completeWork")}
                      </button>
                    )}

                    {allowed.includes("cancelled") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "cancelled" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {t("common.cancel")}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails(wo.id);
                      }}
                      className="col-span-2 min-h-[44px] text-sm px-3 rounded-lg border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 sm:col-span-1 sm:bg-white sm:text-slate-900 sm:hover:bg-slate-50"
                    >
                      {t("workOrder.open")}
                    </button>

                    {allowed.length === 0 && (
                      <span className="text-xs text-slate-400">{t("workOrder.noActions")}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
