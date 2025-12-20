import Card from "../components/Card";
import Badge from "../components/Badge";
import Breadcrumbs from "../components/Breadcrumbs";


export default function TenantDetails({ tenant, property, payments, onBack }) {
  const tenantPayments = payments.filter((p) => p.tenant === tenant.name);
  const paid = tenantPayments.filter((p) => p.status === "Opłacone").length;
  const overdue = tenantPayments.filter((p) => p.status === "Zaległe").length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        ← Wróć do najemców
      </button>

<Breadcrumbs
  items={[
    { label: "Najemcy", to: "/tenants" },
    { label: tenant.name },
  ]}
/>


      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{tenant.name}</h2>
            <p className="text-slate-600 mt-1">{tenant.email}</p>
            <p className="text-slate-600">{tenant.phone}</p>
          </div>

          <div className="flex gap-2">
            {overdue > 0 ? <Badge status="Zaległe" /> : <Badge status="Opłacone" />}
            {property ? <Badge status="Wynajęte" /> : <Badge status="Wolne" />}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Lokal</p>
            <p className="font-semibold">{property?.address || "—"}</p>
            <p className="text-sm text-slate-500">{property?.city || ""}</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Płatności opłacone</p>
            <p className="text-xl font-bold">{paid}</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Płatności zaległe</p>
            <p className="text-xl font-bold text-rose-600">{overdue}</p>
          </Card>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Historia płatności</h3>
        <div className="space-y-3">
          {tenantPayments.length === 0 ? (
            <p className="text-slate-500 text-sm">Brak płatności.</p>
          ) : (
            tenantPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.type}</p>
                  <p className="text-xs text-slate-500">{p.property} • {p.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{p.amount} PLN</p>
                  <div className="mt-1">
                    <Badge status={p.status} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
