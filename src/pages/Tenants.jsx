import { Link } from "react-router-dom";
import Card from "../components/Card";
import Badge from "../components/Badge";

export default function Tenants({
  tenants,
  properties,
  onOpenAddTenant,
  onEditTenant,
  onDeleteTenant,
}) {
  if (tenants.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          Brak najemców
        </h3>
        <p className="text-slate-500 mt-2">
          Dodaj pierwszego najemcę dla tego właściciela
        </p>
        <button
          onClick={onOpenAddTenant}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Dodaj najemcę
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">
          Najemcy
        </h2>
        <button
          onClick={onOpenAddTenant}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Dodaj najemcę
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tenants.map((tenant) => {
          const property = properties.find(
            (p) => p.id === tenant.propertyId
          );

          return (
            <Link
              key={tenant.id}
              to={`/tenants/${tenant.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">
                      {tenant.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {tenant.email}
                    </p>
                  </div>

                  {property && (
                    <Badge status="Wynajęte" />
                  )}
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  {property
                    ? `Wynajmuje: ${property.address}`
                    : "Brak przypisanej nieruchomości"}
                </div>
<div className="flex gap-2 mt-3">
  <button
    onClick={(e) => {
      e.preventDefault();
      onEditTenant(tenant);
    }}
    className="text-sm text-blue-600"
  >
    Edytuj
  </button>

  <button
    onClick={async (e) => {
      e.preventDefault();
      if (confirm("Usunąć najemcę?")) {
        await onDeleteTenant(tenant.id);
      }
    }}
    className="text-sm text-red-600"
  >
    Usuń
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
