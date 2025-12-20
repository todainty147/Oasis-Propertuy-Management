import Card from "../components/Card";
import { Wallet, TrendingUp, AlertCircle, Home } from "lucide-react";

export default function Dashboard({ properties, payments }) {
  const totalRevenue = payments.filter(p => p.status === "Opłacone").reduce((s, p) => s + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "Oczekujące" || p.status === "Zaległe").reduce((s, p) => s + p.amount, 0);
  const occupancyRate = Math.round((properties.filter(p => p.status === "Wynajęte").length / properties.length) * 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Miesięczny Przychód</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalRevenue.toLocaleString()} PLN</h3>
            </div>
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><Wallet size={20} /></div>
          </div>
          <div className="mt-4 flex items-center text-sm text-emerald-600">
            <TrendingUp size={16} className="mr-1" />
            <span>+12% od zeszłego miesiąca</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Oczekujące i Zaległe</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{pendingRevenue.toLocaleString()} PLN</h3>
            </div>
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><AlertCircle size={20} /></div>
          </div>
          <div className="mt-4 text-sm text-slate-500">2 płatności do weryfikacji</div>
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Obłożenie Lokali</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{occupancyRate}%</h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Home size={20} /></div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{properties.length} wszystkich lokali</div>
        </Card>
      </div>
    </div>
  );
}
