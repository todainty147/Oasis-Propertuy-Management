import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";

/* -----------------------------
   UI helpers
----------------------------- */

function StatusPill({ status }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(status ?? "").toLowerCase();

  if (s === "completed")
    return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>Zakończone</span>;
  if (s === "in_progress")
    return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>W trakcie</span>;
  if (s === "cancelled")
    return <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>Anulowane</span>;
  if (s === "blocked")
    return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>Zablokowane</span>;
  return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{status || "assigned"}</span>;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/* -----------------------------
   Page
----------------------------- */

export default function ContractorPortal() {
  const { setTitle } = usePageTitle();
  const { activeRole } = useAccount();
  const navigate = useNavigate();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [allowedById, setAllowedById] = useState({});

  useEffect(() => {
    setTitle("Portal wykonawcy");
  }, [setTitle]);

  async function load() {
    setLoading(true);
    try {
      // Requires: contractor_select_own_work_orders (or equivalent)
      const { data, error } = await supabase
        .from("work_orders")
        .select(
          `
          id,
          account_id,
          property_id,
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

      if (error) throw error;
      const list = data ?? [];
      setRows(list);

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
      alert(e?.message ?? "Nie udało się zaktualizować zlecenia");
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
          Ten ekran jest dostępny tylko dla kont wykonawców (contractor).
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Portal wykonawcy</h2>
            <p className="text-xs text-slate-500 mt-1">
              Widzisz tylko swoje zlecenia. Kliknij/dwuklik, aby wejść w szczegóły.
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
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-slate-600">Brak przypisanych zleceń.</p>
        </Card>
      ) : (
        <div className="divide-y border rounded-lg bg-white">
          {rows.map((wo) => {
            const isBusy = savingId === wo.id;
            const allowed = allowedById[wo.id] ?? [];

            return (
              <div
                key={wo.id}
                className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50 cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => openDetails(wo.id)}
                onDoubleClick={() => openDetails(wo.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetails(wo.id);
                }}
              >
                <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={wo.status} />
                    <span className="text-sm font-medium text-slate-900">
                      {wo.contractor_name || "Zlecenie"}
                    </span>
                    {wo.contractor_phone && (
                      <span className="text-xs text-slate-500">{wo.contractor_phone}</span>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    Termin: {formatDateTime(wo.scheduled_at)} • Utworzono: {formatDateTime(wo.created_at)}
                  </div>

                  <div className="mt-3">
                    <label className="text-xs text-slate-500">Notatki wykonawcy</label>
                    <textarea
                      defaultValue={wo.notes || ""}
                      disabled={isBusy}
                      onBlur={(e) => {
                        const next = e.target.value;
                        if ((wo.notes || "") !== next) updateWorkOrder(wo.id, { notes: next });
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-slate-50"
                      placeholder="Dodaj notatkę (zapis po wyjściu z pola)"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Zapis: automatycznie po kliknięciu poza polem.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  <div className="text-xs text-slate-500">Akcje</div>

                  <div className="flex flex-col gap-2 items-end">
                    {allowed.includes("in_progress") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "in_progress" });
                        }}
                        className={`text-sm hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-blue-600"
                        }`}
                      >
                        W trakcie
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
                        className={`text-sm hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-amber-700"
                        }`}
                      >
                        Zablokowane
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
                        className={`text-sm hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-green-700"
                        }`}
                      >
                        Zakończ
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
                        className={`text-sm hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-slate-600"
                        }`}
                      >
                        Anuluj
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails(wo.id);
                      }}
                      className="text-sm text-slate-900 hover:underline"
                    >
                      Szczegóły →
                    </button>

                    {allowed.length === 0 && (
                      <span className="text-xs text-slate-400">Brak akcji (sprawdź transitions)</span>
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