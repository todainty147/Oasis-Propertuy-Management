import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Lock, Plus } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import { createInspectionReport, listInspectionReports, lockInspectionReport } from "../../services/legalSecurityService";

const EXAMPLE_ROOM_TYPES = ["Entrance / hallway", "Kitchen", "Living room", "Bedroom", "Bathroom", "Garden / exterior", "Meters", "Keys", "Appliances"];

export default function EvidenceVaultPage({ properties = [], tenants = [] }) {
  const { activeAccountId, hasEntitlement } = useAccount();
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({
    title: "Check-in inspection",
    propertyId: "",
    tenantId: "",
    inspectionType: "check_in",
    inspectionDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const mountedRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const nextReports = await listInspectionReports(activeAccountId);
      if (mountedRef.current) setReports(nextReports);
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not load inspection reports.");
      throw err;
    }
  }, [activeAccountId]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      load().catch(() => {});
    });
    return () => { mountedRef.current = false; };
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      setError("");
      await createInspectionReport(activeAccountId, form);
      await load();
    } catch (err) {
      setError(err?.message || "Could not create inspection report.");
    }
  }

  async function handleLock(report) {
    try {
      setError("");
      await lockInspectionReport(report.id, activeAccountId);
      await load();
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not lock inspection report.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Documents</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Evidence Vault</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Create structured check-in, check-out, mid-tenancy, and maintenance evidence reports. Evidence is logged for review; Tenaqo does not provide legal advice.</p>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-950 dark:text-slate-50">Create report</h2>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <select required value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.id}</option>)}
          </select>
          <select value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Tenant optional</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email || tenant.id}</option>)}
          </select>
          <select value={form.inspectionType} onChange={(e) => setForm((f) => ({ ...f, inspectionType: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="check_in">Check-in</option>
            <option value="check_out">Check-out</option>
            <option value="mid_tenancy">Mid-tenancy</option>
            <option value="maintenance_evidence">Maintenance evidence</option>
          </select>
          <input type="date" value={form.inspectionDate} onChange={(e) => setForm((f) => ({ ...f, inspectionDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </div>
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Example room types</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            {EXAMPLE_ROOM_TYPES.map((room) => <span key={room} className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">{room}</span>)}
          </div>
        </div>
        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"><Plus size={16} /> Create draft report</button>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950 dark:text-slate-50">{report.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{report.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{report.inspection_type} · {report.inspection_date}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={report.status === "locked"} onClick={() => handleLock(report)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Lock size={14} /> Lock report</button>
              <button type="button" disabled={!hasEntitlement(ENTITLEMENT_FEATURES.EVIDENCE_VAULT_PDF_EXPORT)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Download size={14} /> Print/PDF placeholder</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
