// src/pages/ContractorJobDetails.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { supabase } from "../lib/supabase";

export default function ContractorJobDetails() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("work_orders")
        .select(
          "id, status, scheduled_at, notes, contractor_name, contractor_phone, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error(error);
        setRow(null);
      } else {
        setRow(data ?? null);
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Szczegóły zlecenia
            </h2>
            <p className="text-xs text-slate-500 mt-1">ID: {id}</p>
          </div>
          <Link
            to="/contractor"
            className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
          >
            Wróć
          </Link>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !row ? (
        <Card className="p-6">
          <p className="text-sm text-slate-600">
            Nie znaleziono zlecenia (lub brak dostępu).
          </p>
        </Card>
      ) : (
        <Card className="p-6 space-y-2">
          <div className="text-sm">
            <span className="text-slate-500">Status:</span>{" "}
            <span className="font-medium text-slate-900">{row.status}</span>
          </div>
          <div className="text-sm">
            <span className="text-slate-500">Termin:</span>{" "}
            <span className="text-slate-900">
              {row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : "—"}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-slate-500">Notatki:</span>{" "}
            <span className="text-slate-900">{row.notes || "—"}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
