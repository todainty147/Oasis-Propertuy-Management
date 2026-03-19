import { Info } from "lucide-react";
import Card from "./Card";

export default function OnboardingHintCard({ title, body }) {
  return (
    <Card className="relative overflow-hidden border border-slate-200 bg-gradient-to-br from-white via-white to-sky-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/70">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 opacity-80" />
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-blue-100 p-2 text-blue-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-300">
          <Info size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p>
        </div>
      </div>
    </Card>
  );
}
