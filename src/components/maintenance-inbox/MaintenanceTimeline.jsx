import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { createAttachmentSignedUrlForRow } from "../../services/workOrderAttachmentsService";
import Skeleton from "../ui/Skeleton";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function safeAt(ts) {
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatAction(action = "") {
  const a = String(action || "").toLowerCase();
  if (a === "insert" || a === "create") return "Utworzono";
  if (a === "update") return "Zmieniono";
  if (a === "delete") return "Usunięto";
  if (a === "status_change") return "Zmiana statusu";
  if (a === "assign") return "Przypisano wykonawcę";
  return action || "Zmiana";
}

export default function MaintenanceTimeline({ accountId, request, linkedWorkOrders = [] }) {
  const navigate = useNavigate();
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
        const reqId = String(request.id);
        const woRows = Array.isArray(linkedWorkOrders) ? linkedWorkOrders : [];
        const woMap = new Map();
        for (const wo of woRows) {
          if (!wo?.id) continue;
          woMap.set(wo.id, wo);
        }
        const woIds = Array.from(woMap.keys());

        const [activityRes, auditRes, attachRes, finRes] = await Promise.all([
          supabase
            .from("activity_log")
            .select("id, action, field, old_value, new_value, actor_role, created_at")
            .eq("account_id", accountId)
            .in("entity_type", ["maintenance_request", "maintenance_requests"])
            .eq("entity_id", reqId)
            .order("created_at", { ascending: true })
            .limit(100),
          woIds.length > 0
            ? supabase
                .from("work_order_audit_log")
                .select("id, work_order_id, action, old_value, new_value, created_at")
                .in("work_order_id", woIds)
                .order("created_at", { ascending: true })
                .limit(500)
            : Promise.resolve({ data: [], error: null }),
          woIds.length > 0
            ? supabase
                .from("work_order_attachments")
                .select("id, work_order_id, file_name, kind, created_at")
                .in("work_order_id", woIds)
                .order("created_at", { ascending: true })
                .limit(500)
            : Promise.resolve({ data: [], error: null }),
          woIds.length > 0
            ? supabase
                .from("work_order_financials")
                .select("work_order_id, quote_submitted_at, approved_at, rejected_at, rejection_reason, invoice_issued_at")
                .in("work_order_id", woIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (activityRes?.error) throw activityRes.error;
        if (auditRes?.error) throw auditRes.error;
        if (attachRes?.error) throw attachRes.error;
        if (finRes?.error) throw finRes.error;

        const next = [];

        // Baseline lifecycle events
        next.push({
          key: `req-created-${request.id}`,
          at: request.created_at,
          title: "Tenant created request",
          detail: request.title || "Zgłoszenie",
          source: "request",
        });

        for (const woId of woIds) {
          const wo = woMap.get(woId);
          next.push({
            key: `wo-created-${woId}`,
            at: wo?.created_at,
            title: "Work order created",
            detail: `WO: ${woId}`,
            woId,
            source: "work_order",
          });
        }

        for (const row of activityRes?.data ?? []) {
          const field = String(row.field || "").toLowerCase();
          const isNoteChange = field === "description";
          const isStatusChange = field === "status" || String(row.action || "").toLowerCase() === "status_change";
          next.push({
            key: `activity-${row.id}`,
            at: row.created_at,
            title: isNoteChange
              ? "Staff added note"
              : isStatusChange
                ? "Request status changed"
                : formatAction(row.action),
            detail: row.field ? `field: ${row.field}` : row.actor_role ? `role: ${row.actor_role}` : "",
            source: "request",
          });
        }

        for (const row of auditRes?.data ?? []) {
          const action = String(row.action || "").toLowerCase();
          const isAssign = action.includes("assign") || action.includes("contractor");
          const isComplete = action.includes("complete") || action.includes("completed");
          const rowWoId = row.work_order_id || null;
          next.push({
            key: `wo-audit-${rowWoId || "na"}-${row.id}`,
            at: row.created_at,
            title: isAssign
              ? "Contractor assigned"
              : isComplete
                ? "Work completed"
                : `Work order ${formatAction(row.action)}`,
            detail: row.action || "",
            woId: rowWoId,
            source: "work_order",
          });
        }

        for (const row of attachRes?.data ?? []) {
          const rowWoId = row.work_order_id || null;
          next.push({
            key: `att-${rowWoId || "na"}-${row.id}`,
            at: row.created_at,
            title: "Photo uploaded",
            detail: row.file_name || row.kind || "Attachment",
            attachmentRow: row,
            woId: rowWoId,
            source: "work_order",
          });
        }

        for (const fin of finRes?.data ?? []) {
          const rowWoId = fin.work_order_id || null;
          if (fin?.quote_submitted_at) {
            next.push({
              key: `fin-quote-submitted-${rowWoId}`,
              at: fin.quote_submitted_at,
              title: "Quote submitted",
              detail: "",
              woId: rowWoId,
              source: "work_order",
            });
          }
          if (fin?.approved_at) {
            next.push({
              key: `fin-quote-approved-${rowWoId}`,
              at: fin.approved_at,
              title: "Quote approved",
              detail: "",
              woId: rowWoId,
              source: "work_order",
            });
          }
          if (fin?.rejected_at) {
            next.push({
              key: `fin-quote-rejected-${rowWoId}`,
              at: fin.rejected_at,
              title: "Quote rejected",
              detail: fin.rejection_reason || "",
              woId: rowWoId,
              source: "work_order",
            });
          }
          if (fin?.invoice_issued_at) {
            next.push({
              key: `fin-invoice-issued-${rowWoId}`,
              at: fin.invoice_issued_at,
              title: "Invoice issued",
              detail: "",
              woId: rowWoId,
              source: "work_order",
            });
          }
        }

        // If request is closed, emit a clear endpoint event.
        if (String(request.status || "").toLowerCase() === "closed") {
          next.push({
            key: `req-closed-${request.id}`,
            at: request.updated_at || request.created_at,
            title: "Request closed",
            detail: "",
            source: "request",
          });
        }

        next.sort((a, b) => safeAt(a.at) - safeAt(b.at));

        if (alive) setEvents(next);
      } catch (e) {
        if (alive) {
          setError(e?.message || "Nie udało się wczytać timeline.");
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
  }, [accountId, request, linkedWorkOrders]);

  const rows = useMemo(() => {
    const all = events ?? [];
    if (scope === "request") return all.filter((e) => e.source === "request");
    if (scope === "work_order") return all.filter((e) => e.source === "work_order");
    return all;
  }, [events, scope]);

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

    if (e.woId) {
      navigate(`/work-orders/${e.woId}`);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScope("all")}
          className={`px-2 py-1 text-[11px] rounded border ${
            scope === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          Wszystkie
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
          Tylko zgłoszenie
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
          Tylko zlecenia
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">Brak zdarzeń timeline.</p>
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
                  ? "Kliknij, aby otworzyć załącznik"
                  : e.woId
                    ? "Kliknij, aby otworzyć zlecenie"
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
                  {busyKey === e.key ? " • otwieranie…" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
