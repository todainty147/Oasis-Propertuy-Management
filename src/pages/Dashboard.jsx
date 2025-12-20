import Card from "../components/Card";
import { Wallet, TrendingUp, AlertCircle, Home } from "lucide-react";

export default function Dashboard({
  properties,
  payments,
  occupiedCount,
  vacantCount,
  occupancyRate,
  longVacantCount,
  shortVacantCount,
  longVacantProperties,
}) {
  const totalRevenue = payments
    .filter((p) => p.status === "Opłacone")
    .reduce((s, p) => s + p.amount, 0);

  const pendingRevenue = payments
    .filter(
      (p) => p.status === "Oczekujące" || p.status === "Zaległe"
    )
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* REVENUE */}
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Miesięczny Przychód
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {totalRevenue.toLocaleString()} PLN
              </h3>
            </div>
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm text-emerald-600">
            <TrendingUp size={16} className="mr-1" />
            <span>+12% od zeszłego miesiąca</span>
          </div>
        </Card>

        {/* PENDING */}
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Oczekujące i Zaległe
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {pendingRevenue.toLocaleString()} PLN
              </h3>
            </div>
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            {
              payments.filter(
                (p) =>
                  p.status === "Oczekujące" ||
                  p.status === "Zaległe"
              ).length
            }{" "}
            płatności do weryfikacji
          </div>
        </Card>

        {/* OCCUPIED */}
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Wynajęte Lokale
              </p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">
                {occupiedCount}
              </h3>
            </div>
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <Home size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            z {properties.length} lokali
          </div>
        </Card>

        {/* OCCUPANCY */}
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Obłożenie Lokali
              </p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">
                {occupancyRate}%
              </h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Home size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            {vacantCount} wolnych lokali
          </div>
        </Card>

        {/* LONG VACANT COUNT */}
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Długotrwale Puste
              </p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">
                {longVacantCount}
              </h3>
            </div>
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            {shortVacantCount} wolne ≤ 30 dni
          </div>
        </Card>
      </div>

      {/* VACANCY AGING TABLE */}
      {longVacantProperties.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-600">
            Lokale puste ponad 30 dni
          </h3>

          <div className="divide-y">
            {longVacantProperties.map((p) => (
              <div
                key={p.id}
                className="py-3 flex justify-between items-center"
              >
                <div>
                  <p className="font-medium">{p.address}</p>
                  <p className="text-sm text-slate-500">
                    {p.city}
                  </p>
                </div>

                <span className="text-sm font-semibold text-red-600">
                  {p.daysVacant} dni
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
