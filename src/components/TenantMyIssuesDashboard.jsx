import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";

function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    green: "bg-green-50 border-green-200 text-green-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function statusTone(s) {
  const v = String(s ?? "").toLowerCase();
  if (["open", "new"].includes(v)) return "amber";
  if (["waiting", "assigned"].includes(v)) return "blue";
  if (["in_progress"].includes(v)) return "blue";
  if (["resolved", "closed", "completed"].includes(v)) return "green";
  if (["cancelled"].includes(v)) return "slate";
  return "slate";
}

export default function TenantMyIssuesDashboard({ propertyId, onOpenIssue }) {
  const { activeAccountId, activeRole } = useAccount();

  const isTenant = useMemo(
    () => String(activeRole ?? "").toLowerCase() === "tenant",
    [activeRole]
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!activeAccountId || !isTenant) return;

    setLoading(true);
    try {
      let q = supabase
        .from("tenant_my_issues")
        .select(
          `
          maintenance_request_id,
          account_id,
          property_id,
          title,
          maintenance_status,
          priority,
          created_at,
          latest_work_order_status,
          latest_work_order_id
        `
        )
        .eq("account_id", activeAccountId)
        .order("created_at", { ascending: false })
        .limit(20);

      // If you are on a property details page, keep it scoped
      if (propertyId) q = q.eq("property_id", propertyId);

      const { data, error } = await q;
      if (error) throw error;

      setRows(data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, isTenant, propertyId]);

  const stats = useMemo(() => {
    const out = {
      open: 0,
      active: 0,
      done: 0,
      wo_active: 0,
    };

    for (const r of rows) {
      const s = String(r.maintenance_status ?? "").toLowerCase();
      const wo = String(r.latest_work_order_status ?? "").toLowerCase();

      if (["open", "new"].includes(s)) out.open += 1;
      else if (["waiting", "in_progress"].includes(s)) out.active += 1;
      else if (["resolved", "closed"].includes(s)) out.done += 1;

      if (["assigned", "in_progress"].includes(wo)) out.wo_active += 1;
    }

    return out;
  }, [rows]);

  if (!isTenant) return null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Moje zgłoszenia</h3>
          <p className="text-xs text-slate-500 mt-1">
            Podgląd Twoich usterek i powiązanych zleceń.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
        >
          Odśwież
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="border rounded-xl p-3">
              <div className="text-xs text-slate-500">Otwarte</div>
              <div className="text-xl font-bold mt-1">{stats.open}</div>
            </div>
            <div className="border rounded-xl p-3">
              <div className="text-xs text-slate-500">W trakcie / Oczekuje</div>
              <div className="text-xl font-bold mt-1">{stats.active}</div>
            </div>
            <div className="border rounded-xl p-3">
              <div className="text-xs text-slate-500">Zamknięte</div>
              <div className="text-xl font-bold mt-1">{stats.done}</div>
            </div>
            <div className="border rounded-xl p-3">
              <div className="text-xs text-slate-500">Zlecenia aktywne</div>
              <div className="text-xl font-bold mt-1">{stats.wo_active}</div>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">Brak zgłoszeń.</p>
          ) : (
            <div className="divide-y border rounded-lg bg-white">
              {rows.slice(0, 10).map((r) => (
                <div key={r.maintenance_request_id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={statusTone(r.maintenance_status)}>
                        {String(r.maintenance_status || "").replaceAll("_", " ")}
                      </Pill>
                      {r.latest_work_order_status && (
                        <Pill tone={statusTone(r.latest_work_order_status)}>
                          Zlecenie: {String(r.latest_work_order_status).replaceAll("_", " ")}
                        </Pill>
                      )}
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {r.title}
                      </span>
                    </div>
                    {r.priority && (
                      <div className="text-xs text-slate-500 mt-1">
                        Priorytet: {r.priority}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenIssue?.(r)}
                    className="text-sm hover:underline text-slate-700 shrink-0"
                  >
                    Otwórz
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
