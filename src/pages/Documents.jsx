import Card from "../components/Card";
import Badge from "../components/Badge";
import { FileText, CheckCircle } from "lucide-react";

export default function Documents() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Centrum Dokumentów</h2>
        <p className="text-slate-500 text-sm mt-1">Generuj umowy i protokoły zgodne z polskim prawem.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><FileText size={24} /></div>
            <Badge status="Standard" />
          </div>
          <h3 className="font-bold text-lg mb-2">Najem Okazjonalny</h3>
          <p className="text-slate-600 text-sm mb-4">Wzór umowy najmu okazjonalnego z wymaganymi załącznikami.</p>
          <button className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium">Generuj PDF</button>
        </Card>

        <Card className="p-6 border-l-4 border-l-purple-500">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600"><CheckCircle size={24} /></div>
            <Badge status="Protokół" />
          </div>
          <h3 className="font-bold text-lg mb-2">Protokół Zdawczo-Odbiorczy</h3>
          <p className="text-slate-600 text-sm mb-4">Lista kontrolna: liczniki, wyposażenie, stan techniczny.</p>
          <button className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium">Generuj PDF</button>
        </Card>
      </div>
    </div>
  );
}
