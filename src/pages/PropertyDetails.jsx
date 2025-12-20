import { useParams, useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Breadcrumbs from "../components/Breadcrumbs";

export default function PropertyDetails({ properties, tenants }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const property = properties.find(
    (p) => String(p.id) === String(id)
  );

  if (!property) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p>Nie znaleziono nieruchomości.</p>
        <button
          className="mt-4 text-blue-600"
          onClick={() => navigate("/properties")}
        >
          ← Wróć
        </button>
      </div>
    );
  }

  const assignedTenants = tenants.filter(
    (t) => t.propertyId === property.id
  );

  // ⬇️ rest of your JSX stays EXACTLY the same


  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Nieruchomości", to: "/properties" },
          { label: property.address },
        ]}
      />

      <Card className="p-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {property.address}
        </h2>
        <p className="text-slate-600 mt-1">
          {property.city} • {property.size}
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Czynsz</p>
            <p className="font-semibold">{property.rent} PLN</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Status</p>
            <p className="font-semibold">{property.status}</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Najemcy</p>
            <p className="font-semibold">
              {assignedTenants.length || "Brak"}
            </p>
          </Card>
        </div>
      </Card>
    </div>
  );
}
 