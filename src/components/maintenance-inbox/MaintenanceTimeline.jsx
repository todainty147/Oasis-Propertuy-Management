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

export default function MaintenanceTimeline({ accountId, request, linkedWorkOrder }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadTimeline() {
      if (!accountId || !request?.id) return;
      setLoading(true);
      setError("");

      try {
        const reqId = String(request.id);
        const woId = linkedWorkOrder?.id || null;

        const jobs = [
          supabase
            .from("activity_log")
            .select("id, action, field, old_value, new_value, actor_role, created_at")
            .eq("account_id", accountId)
            .in("entity_type", ["maintenance_request", "maintenance_requests"])
            .eq("entity_id", reqId)
            .order("created_at", { ascending: true })
            .limit(100),
        ];

        if (woId) {
          jobs.push(
            supabase
              .from("work_order_audit_log")
              .select("id, action, old_value, new_value, created_at")
              .eq("work_order_id", woId)
              .order("created_at", { ascending: true })
              .limit(200)
          );

          jobs.push(
            supabase
              .from("work_order_attachments")
              .select("id, file_name, kind, created_at")
              .eq("work_order_id", woId)
              .order("created_at", { ascending: true })
              .limit(200)
          );

          jobs.push(
            supabase
              .from("work_order_financials")
              .select("quote_submitted_at, approved_at, rejected_at, rejection_reason, invoice_issued_at")
              .eq("work_order_id", woId)
              .maybeSingle()
          );
        }

        const results = await Promise.all(jobs);
        const [activityRes, auditRes, attachRes, finRes] = results;

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
        });

        if (woId) {
          next.push({
            key: `wo-created-${woId}`,
            at: linkedWorkOrder.created_at,
            title: "Work order created",
            detail: `WO: ${woId}`,
            woId,
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
          });
        }

        for (const row of auditRes?.data ?? []) {
          const action = String(row.action || "").toLowerCase();
          const isAssign = action.includes("assign") || action.includes("contractor");
          const isComplete = action.includes("complete") || action.includes("completed");
          next.push({
            key: `wo-audit-${row.id}`,
            at: row.created_at,
            title: isAssign
              ? "Contractor assigned"
              : isComplete
                ? "Work completed"
                : `Work order ${formatAction(row.action)}`,
            detail: row.action || "",
            woId,
          });
        }

        for (const row of attachRes?.data ?? []) {
          next.push({
            key: `att-${row.id}`,
            at: row.created_at,
            title: "Photo uploaded",
            detail: row.file_name || row.kind || "Attachment",
            attachmentRow: row,
            woId,
          });
        }

        const fin = finRes?.data;
        if (fin?.quote_submitted_at) {
          next.push({
            key: `fin-quote-submitted-${woId}`,
            at: fin.quote_submitted_at,
            title: "Quote submitted",
            detail: "",
            woId,
          });
        }
        if (fin?.approved_at) {
          next.push({
            key: `fin-quote-approved-${woId}`,
            at: fin.approved_at,
            title: "Quote approved",
            detail: "",
            woId,
          });
        }
        if (fin?.rejected_at) {
          next.push({
            key: `fin-quote-rejected-${woId}`,
            at: fin.rejected_at,
            title: "Quote rejected",
            detail: fin.rejection_reason || "",
            woId,
          });
        }
        if (fin?.invoice_issued_at) {
          next.push({
            key: `fin-invoice-issued-${woId}`,
            at: fin.invoice_issued_at,
            title: "Invoice issued",
            detail: "",
            woId,
          });
        }

        // If request is closed, emit a clear endpoint event.
        if (String(request.status || "").toLowerCase() === "closed") {
          next.push({
            key: `req-closed-${request.id}`,
            at: request.updated_at || request.created_at,
            title: "Request closed",
            detail: "",
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
  }, [accountId, request, linkedWorkOrder]);

  const rows = useMemo(() => events ?? [], [events]);

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

  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">Brak zdarzeń timeline.</p>;
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
    </div>
  );
}
