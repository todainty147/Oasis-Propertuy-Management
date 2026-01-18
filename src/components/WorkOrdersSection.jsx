// src/components/WorkOrdersSection.jsx
import { useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useWorkOrders } from "../hooks/useWorkOrders";
import { createWorkOrder, deleteWorkOrder, updateWorkOrder } from "../services/workOrderService";

function StatusPill({ status }) {
  const label = status || "—";
  const base = "text-xs px-2 py-0.5 rounded border";

  const s = String(status ?? "").toLowerCase();
  if (s === "completed") return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>Zakończone</span>;
  if (s === "in_progress") return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>W trakcie</span>;
  if (s === "cancelled") return <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>Anulowane</span>;
  return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{label}</span>;
}

export default function WorkOrdersSection({ propertyId }) {
  const { activeAccountId, activeRole } = useAccount();

  // owner/admin/staff can manage work orders
  const canManage = useMemo(() => {
    return ["owner", "admin", "staff"].includes(String(activeRole ?? "").toLowerCase());
  }, [activeRole]);

  const { workOrders, loading, error } = useWorkOrders({
    enabled: !!activeAccountId && !!propertyId,
    propertyId,
  });

  // Minimal create form (kept small & safe)
  const [open, setOpen] = useState(false);
  const [maintenanceRequestId, setMaintenanceRequestId] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!activeAccountId || !propertyId) return;

    setSaving(true);
    try {
      await createWorkOrder({
        accountId: activeAccountId,
        propertyId,
        maintenanceRequestId: maintenanceRequestId || null,
        contractorName: contractorName || null,
        contractorPhone: contractorPhone || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes: notes || null,
        status: "assigned",
      });

      // reset
      setOpen(false);
      setMaintenanceRequestId("");
      setContractorName("");
      setContractorPhone("");
      setScheduledAt("");
      setNotes("");
    } catch (e) {
      alert(e?.message ?? "Nie udało się utworzyć zlecenia");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Usunąć zlecenie?")) return;
    try {
      await deleteWorkOrder(id);
    } catch (e) {
      alert(e?.message ?? "Nie udało się usunąć zlecenia");
    }
  }

  async function setStatus(id, nextStatus) {
    try {
      await updateWorkOrder(id, { status: nextStatus });
    } catch (e) {
      alert(e?.message ?? "Nie udało się zmienić statusu");
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Zlecenia (Work Orders)</h3>
          <p className="text-xs text-slate-500 mt-1">
            Zlecenia dla tej nieruchomości. W przyszłości dodamy przypisanie do kontraktorów + portal wykonawcy.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
          >
            {open ? "Zamknij" : "Dodaj zlecenie"}
          </button>
        )}
      </div>

      {open && canManage && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Maintenance Request ID (opcjonalnie)</label>
              <input
                value={maintenanceRequestId}
                onChange={(e) => setMaintenanceRequestId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="UUID zgłoszenia"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Termin (opcjonalnie)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Wykonawca (nazwa)</label>
              <input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Np. HydroFix"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Telefon</label>
              <input
                value={contractorPhone}
                onChange={(e) => setContractorPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="+48…"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">Notatki</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px]"
              placeholder="Opis prac / instrukcje"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm rounded-lg border"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-blue-600"}`}
            >
              {saving ? "Zapisywanie…" : "Utwórz"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {String(error?.message ?? error)}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!loading && workOrders.length === 0 && (
        <p className="text-sm text-slate-500">Brak zleceń dla tej nieruchomości.</p>
      )}

      {!loading && workOrders.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {workOrders.map((wo) => (
            <div key={wo.id} className="px-4 py-3 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={wo.status} />
                  {wo.contractor_name && (
                    <span className="text-sm font-medium text-slate-900">
                      {wo.contractor_name}
                    </span>
                  )}
                  {wo.contractor_phone && (
                    <span className="text-xs text-slate-500">{wo.contractor_phone}</span>
                  )}
                </div>

                {wo.maintenance_requests?.title && (
                  <p className="text-sm text-slate-700 mt-1">
                    Powiązane zgłoszenie: <b>{wo.maintenance_requests.title}</b>
                  </p>
                )}

                {wo.scheduled_at && (
                  <p className="text-xs text-slate-500 mt-1">
                    Termin: {new Date(wo.scheduled_at).toLocaleString()}
                  </p>
                )}

                {wo.notes && (
                  <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">
                    {wo.notes}
                  </p>
                )}
              </div>

              {canManage && (
                <div className="flex gap-3 text-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => setStatus(wo.id, "in_progress")}
                    className="text-blue-600 hover:underline"
                  >
                    W trakcie
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(wo.id, "completed")}
                    className="text-green-700 hover:underline"
                  >
                    Zakończ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(wo.id)}
                    className="text-rose-600 hover:underline"
                  >
                    Usuń
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
