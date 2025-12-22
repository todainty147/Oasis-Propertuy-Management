import { Link } from "react-router-dom";
import Card from "../components/Card";
import Badge from "../components/Badge";
import { Home, Pencil, Trash2 } from "lucide-react";

export default function Properties({
  properties,
  tenants,
  onAddProperty,
  onEditProperty,
  onDeleteProperty,
}) {
  if (properties.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          Brak nieruchomości
        </h3>
        <p className="text-slate-500 mt-2">
          Dodaj swoją pierwszą nieruchomość
        </p>
        <button
          onClick={onAddProperty}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Dodaj nieruchomość
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h2 className="text-2xl font-bold">Nieruchomości</h2>
        <button
          onClick={onAddProperty}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Dodaj nieruchomość
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((p) => {
          // 🔑 correct tenant lookup
          const isOccupied = p.status === "Wynajęte";

          return (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
            >
              <Card className="relative hover:shadow-md transition-shadow">
                <div className="h-32 bg-slate-100 flex items-center justify-center">
                  <Home size={40} className="text-slate-300" />
                </div>

                <div className="p-5">
                  <h3 className="font-semibold">{p.address}</h3>
                  <p className="text-sm text-slate-500">
                    {p.city} • {p.size}
                  </p>

                  <div className="mt-3 flex justify-between text-sm">
                    <span>Czynsz</span>
                    <span className="font-medium">
                      {p.rent != null ? `${p.rent} PLN` : "—"}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between text-sm">
                    <span>Najemca</span>
                    <span>{p.status === "Wynajęte" ? "Wynajęte" : "Brak"}</span>

                  </div>
                </div>

                {/* STATUS */}
                <div className="absolute top-3 left-3">
                  <Badge status={p.status} />
                </div>

                {/* ACTIONS */}
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEditProperty(p);
                    }}
                    className="p-1 bg-white rounded hover:bg-slate-100"
                  >
                    <Pencil size={16} />
                  </button>

                  <button
  disabled={isOccupied}
  title={
    isOccupied
      ? "Usuń przypisanie najemcy przed usunięciem nieruchomości"
      : "Usuń nieruchomość"
  }
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteProperty(p.id);
  }}
  className={`p-1 rounded ${
    isOccupied
      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
      : "bg-white hover:bg-slate-100"
  }`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
