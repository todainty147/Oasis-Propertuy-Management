import { Link } from "react-router-dom";
import { AlertTriangle, Archive, ClipboardCheck, FileCheck2, PenLine, ShieldCheck } from "lucide-react";

function Metric({ icon, label, value, tone = "slate" }) {
  const IconComponent = icon;
  const toneClass = {
    teal: "text-teal-300",
    amber: "text-amber-200",
    rose: "text-rose-200",
    blue: "text-blue-200",
    slate: "text-slate-200",
  }[tone] || "text-slate-200";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
        <IconComponent size={14} className={toneClass} /> {label}
      </div>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function RiskProtectionSummary({ summary = {}, complianceRating = null }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Risk Protection Suite</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Launch summary</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            A concise view of compliance checklist health, tenant responses and organised evidence records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/compliance/safe" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200">Open Compliance Safe</Link>
          <Link to="/documents/evidence-vault" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200">Open Evidence Vault</Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Metric icon={ShieldCheck} label="Compliance rating" value={complianceRating === null ? "--" : `${complianceRating}%`} tone="teal" />
        <Metric icon={AlertTriangle} label="Missing/expired" value={summary.missingComplianceItems || 0} tone="rose" />
        <Metric icon={AlertTriangle} label="Expiring soon" value={summary.expiringComplianceItems || 0} tone="amber" />
        <Metric icon={ClipboardCheck} label="Tenant acknowledgements" value={summary.pendingTenantAcknowledgements || 0} tone="amber" />
        <Metric icon={PenLine} label="Evidence signatures" value={summary.pendingTenantEvidenceSignatures || 0} tone="amber" />
        <Metric icon={FileCheck2} label="Locked reports" value={summary.lockedEvidenceReports || 0} tone="blue" />
        <Metric icon={Archive} label="Draft dispute packs" value={summary.draftDisputePacks || 0} tone="slate" />
      </div>
    </section>
  );
}
