import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { calculateComplianceRating, COMPLIANCE_SAFE_STATUS_LABELS } from "../../utils/complianceSafe";
import { listComplianceSafeItems, updateComplianceSafeItem } from "../../services/legalSecurityService";

const SAFE_COPY =
  "Track statutory tenancy documents, safety certificates, deposit evidence and onboarding acknowledgements. Tenaqo helps organise evidence and does not provide legal advice.";

function panelClass() {
  return "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
}

export default function ComplianceSafePage({ properties = [], tenants = [] }) {
  const { activeAccountId } = useAccount();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ propertyId: "", tenantId: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      setLoading(true);
      setError("");
      setItems(await listComplianceSafeItems(activeAccountId, filters));
    } catch (err) {
      setError(err?.message || "Could not load Compliance Safe records.");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, filters]);

  useEffect(() => { load(); }, [load]);

  const rating = useMemo(() => calculateComplianceRating(items), [items]);

  async function updateStatus(item, status) {
    await updateComplianceSafeItem(item.id, activeAccountId, { status });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Compliance</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Compliance Safe</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{SAFE_COPY}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className={panelClass()}>
          <p className="text-xs uppercase text-slate-500">Compliance rating</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-slate-50">{rating.rating}%</p>
        </div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Missing</p><p className="mt-2 text-2xl font-semibold">{rating.counts.missing}</p></div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Expiring soon</p><p className="mt-2 text-2xl font-semibold">{rating.counts.expiring_soon}</p></div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Needs review</p><p className="mt-2 text-2xl font-semibold">{rating.counts.needs_review}</p></div>
      </div>

      <div className={`${panelClass()} grid gap-3 md:grid-cols-3`}>
        <select value={filters.propertyId} onChange={(e) => setFilters((f) => ({ ...f, propertyId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="">All properties</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.name || property.id}</option>)}
        </select>
        <select value={filters.tenantId} onChange={(e) => setFilters((f) => ({ ...f, tenantId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="">All tenants</option>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email || tenant.id}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="">All statuses</option>
          {Object.entries(COMPLIANCE_SAFE_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? <div className={panelClass()}>Loading Compliance Safe...</div> : null}

      {!loading && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className={panelClass()}>
              <p className="text-sm text-slate-500">No compliance checklist items yet. Items will appear here once a compliance template has been set up for a tenancy.</p>
            </div>
          ) : items.map((item) => (
            <div key={item.id} className={panelClass()}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={17} className="text-teal-600" />
                    <h2 className="font-semibold text-slate-950 dark:text-slate-50">{item.compliance_requirements?.label || "Compliance item"}</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{COMPLIANCE_SAFE_STATUS_LABELS[item.status] || "Needs review"}</p>
                  {item.expires_at ? <p className="text-xs text-slate-500">Expires {item.expires_at}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateStatus(item, "logged")} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"><FileText size={14} /> Mark as logged</button>
                  <button type="button" onClick={() => updateStatus(item, "not_applicable")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-700"><CheckCircle2 size={14} /> Not applicable</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
