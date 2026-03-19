import { Info } from "lucide-react";
import Card from "./Card";

export default function OnboardingHintCard({ title, body }) {
  return (
    <Card className="border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-white p-2 text-sky-700 shadow-sm">
          <Info size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
        </div>
      </div>
    </Card>
  );
}
