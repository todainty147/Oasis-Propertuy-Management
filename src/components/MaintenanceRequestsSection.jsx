// src/components/MaintenanceRequestsSection.jsx
import { useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useMaintenanceRequests } from "../hooks/useMaintenanceRequests";
import { createMaintenanceRequest, updateMaintenanceRequest } from "../services/maintenanceService";

function statusLabel(status) {
  switch (status) {
    case "open":
      return "Otwarte";
    case "in_progress":
      return "W trakcie";
    case "waiting":
      return "Oczekuje";
    case "resolved":
      return "Rozwiązane";
    case "closed":
      return "Zamknięte";
    default:
      return status ?? "—";
  }
}

function priorityLabel(priority) {
  switch (priority) {
    case "low":
      return "Niski";
    case "normal":
      return "Normalny";
    case "high":
      return "Wysoki";
    case "urgent":
      return "Pilny";
    default:
      return priority ?? "—";
  }
}

export default function MaintenanceRequestsSection({ propertyId }) {
  const { activeAccountId, activeRole } = useAccount();

  const { requests, loading, error } = useMaintenanceRequests({
    enabled: !!activeAccountId && !!propertyId,
    propertyId,
    limit: 50,
  });

  const canWrite = useMemo(() => {
    const r = String(activeRole ?? "").toLowerCase();
    return ["owner", "admin", "staff"].includes(r);
  }, [activeRole]);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");

  async function handleCreate() {
    if (!activeAccountId || !propertyId) return;

    try {
      setCreating(true);
      await createMaintenanceRequest({
        accountId: activeAccountId,
        propertyId,
        title,
        description,
        priority,
      });
      setTitle("");
      setDescription("");
      setPriority("normal");
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Nie udało się utworzyć zgłoszenia");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id, nextStatus) {
    try {
      await updateMaintenanceRequest(id, { status: nextStatus });
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Nie udało się zmienić statusu");
    }
  }

  function renderActions(r) {
    if (!canWrite) return null;

    const s = String(r.status ?? "").toLowerCase();

    // When resolved/closed, do NOT show "Rozwiąż"
    if (s === "resolved" || s === "closed") {
      return (
        <div className="flex flex-col gap-2 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setStatus(r.id, "open")}
            className="text-slate-600 hover:underline text-right"
          >
            Otwórz ponownie
          </button>
          {s !== "closed" && (
            <button
              type="button"
              onClick={() => setStatus(r.id, "closed")}
              className="text-slate-600 hover:underline text-right"
            >
              Zamknij
            </button>
          )}
        </div>
      );
    }

    // Default actions for active tickets
    return (
      <div className="flex flex-col gap-2 text-xs shrink-0">
        {s !== "open" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "open")}
            className="text-slate-600 hover:underline text-right"
          >
            Otwórz
          </button>
        )}

        {s !== "in_progress" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "in_progress")}
            className="text-blue-600 hover:underline text-right"
          >
            W trakcie
          </button>
        )}

        {s !== "waiting" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "waiting")}
            className="text-slate-600 hover:underline text-right"
          >
            Oczekuje
          </button>
        )}

        {/* This is the "resolve" action */}
        <button
          type="button"
          onClick={() => setStatus(r.id, "resolved")}
          className="text-green-700 hover:underline text-right"
        >
          Rozwiąż
        </button>

        <button
          type="button"
          onClick={() => setStatus(r.id, "closed")}
          className="text-slate-600 hover:underline text-right"
        >
          Zamknij
        </button>
      </div>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Usterki / Zgłoszenia</h3>
          <p className="text-sm text-slate-500">Zgłoszenia serwisowe dla tej nieruchomości</p>
        </div>
        <div className="text-sm text-slate-600">{requests?.length ?? 0} zgłoszeń</div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border bg-white">
          <p className="text-sm text-rose-600">Błąd: {String(error.message ?? error)}</p>
        </div>
      )}

      {canWrite && (
        <div className="border rounded-xl bg-white p-4 space-y-3">
          <p className="text-sm font-medium">Dodaj zgłoszenie</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Tytuł</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="np. Przeciek pod zlewem"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Priorytet</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="low">Niski</option>
                <option value="normal">Normalny</option>
                <option value="high">Wysoki</option>
                <option value="urgent">Pilny</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">Opis</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Dodaj szczegóły (opcjonalnie)"
            />
          </div>

          <div className="flex justify-end">
            <button
              disabled={creating || !title.trim()}
              onClick={handleCreate}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-60"
            >
              {creating ? "Dodawanie..." : "Dodaj"}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {!loading && requests.length === 0 && (
        <p className="text-sm text-slate-500">Brak zgłoszeń dla tej nieruchomości.</p>
      )}

      {!loading && requests.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {requests.map((r) => (
            <div key={r.id} className="px-4 py-3 flex gap-4 justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.title}</p>

                {r.description && (
                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">{r.description}</p>
                )}

                <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                  <span>Status: {statusLabel(r.status)}</span>
                  <span>Priorytet: {priorityLabel(r.priority)}</span>
                  <span>
                    Utworzono: {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              {renderActions(r)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
