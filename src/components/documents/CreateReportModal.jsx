import { Plus, X } from "lucide-react";

export default function CreateReportModal({
  open,
  form,
  onChange,
  onClose,
  onSubmit,
  properties = [],
  tenants = [],
  roomTypes = [],
  busy = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-evidence-report-title"
        className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Evidence Vault</p>
            <h2 id="create-evidence-report-title" className="mt-1 text-lg font-semibold text-slate-50">
              New inspection report
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Create a draft with the standard room checklist ready for a walkthrough.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-900"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-200 md:col-span-1">
              Report title
              <input
                required
                value={form.title}
                onChange={(event) => onChange({ title: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-400"
              />
            </label>
            <label className="text-sm font-medium text-slate-200">
              Inspection type
              <select
                value={form.inspectionType}
                onChange={(event) => onChange({ inspectionType: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-400"
              >
                <option value="check_in">Check-in</option>
                <option value="check_out">Check-out</option>
                <option value="mid_tenancy">Mid-tenancy</option>
                <option value="maintenance_evidence">Maintenance evidence</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-200">
              Property
              <select
                required
                value={form.propertyId}
                onChange={(event) => onChange({ propertyId: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-400"
              >
                <option value="">Choose property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.address || property.name || property.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-200">
              Tenant
              <select
                value={form.tenantId}
                onChange={(event) => onChange({ tenantId: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-400"
              >
                <option value="">No tenant linked</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name || tenant.email || tenant.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-200">
              Inspection date
              <input
                required
                type="date"
                value={form.inspectionDate}
                onChange={(event) => onChange({ inspectionDate: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-blue-400"
              />
            </label>
          </div>

          <details className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-100">
              Rooms that will be created
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {roomTypes.map((room) => (
                <span key={room} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  {room}
                </span>
              ))}
            </div>
          </details>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              <Plus size={16} /> {busy ? "Creating..." : "Create draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
