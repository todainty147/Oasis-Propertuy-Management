import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import {
  createPropertyApplicationLink,
  listPropertyApplicationLinks,
  listRentalApplications,
  updateRentalApplicationStatus,
} from "../../services/legalSecurityService";

export default function ApplicationsPage({ properties = [] }) {
  const { activeAccountId } = useAccount();
  const [links, setLinks] = useState([]);
  const [applications, setApplications] = useState([]);
  const [form, setForm] = useState({ propertyId: "", title: "Rental application", monthlyRent: "", availableFrom: "" });
  const [error, setError] = useState("");
  const mountedRef = useRef(false);

  const load = useCallback(async ({ isCurrent = () => mountedRef.current } = {}) => {
    if (!activeAccountId) return;
    try {
      const [nextLinks, nextApplications] = await Promise.all([
        listPropertyApplicationLinks(activeAccountId),
        listRentalApplications(activeAccountId),
      ]);
      if (!isCurrent()) return;
      setLinks(nextLinks);
      setApplications(nextApplications);
    } catch (err) {
      if (isCurrent()) setError(err?.message || "Could not load application links.");
    }
  }, [activeAccountId]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    Promise.resolve().then(() => load({ isCurrent: () => mountedRef.current && !cancelled }));
    return () => { cancelled = true; mountedRef.current = false; };
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      setError("");
      await createPropertyApplicationLink(activeAccountId, {
        propertyId: form.propertyId,
        title: form.title,
        monthlyRent: form.monthlyRent,
        availableFrom: form.availableFrom,
        preferences: { monthlyRent: Number(form.monthlyRent) || null, availableFrom: form.availableFrom || null },
      });
      await load();
    } catch (err) {
      setError(err?.message || "Could not create application link.");
    }
  }

  async function setStatus(application, status) {
    try {
      setError("");
      await updateRentalApplicationStatus(activeAccountId, application.id, status);
      await load();
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not update application status.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Applications</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Tenant Application Links</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Use application information consistently and fairly. Do not make decisions based on protected characteristics. This is a pre-screening match, not a credit score.</p>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-950 dark:text-slate-50">Create application link</h2>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select required value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Vacant property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.id}</option>)}
          </select>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <input type="number" placeholder="Monthly rent" value={form.monthlyRent} onChange={(e) => setForm((f) => ({ ...f, monthlyRent: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <input type="date" value={form.availableFrom} onChange={(e) => setForm((f) => ({ ...f, availableFrom: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </div>
        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"><Plus size={16} /> Create link</button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-950 dark:text-slate-50">Active links</h2>
        <div className="mt-3 space-y-2">
          {links.map((link) => (
            <div key={link.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800 md:flex-row md:items-center md:justify-between">
              <span>{link.title} · {link.status}</span>
              <a href={`/apply/${link.public_token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-medium text-blue-700"><ExternalLink size={14} /> Open public form</a>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-950 dark:text-slate-50">Applicant pre-screening dashboard</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Applicant</th><th>Status</th><th>Pre-screening match</th><th>Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {applications.map((application) => {
                return (
                  <tr key={application.id}>
                    <td className="py-3"><strong>{application.applicant_name || "Applicant"}</strong><br /><span className="text-xs text-slate-500">{application.applicant_email}</span></td>
                    <td>{application.status}</td>
                    <td>{Math.max(0, Math.min(100, Number(application.score || 0)))}%</td>
                    <td className="space-x-2">
                      <button type="button" onClick={() => setStatus(application, "shortlisted")} className="rounded-lg border border-slate-200 px-3 py-1 text-xs dark:border-slate-700">Shortlist</button>
                      <button type="button" onClick={() => setStatus(application, "rejected")} className="rounded-lg border border-slate-200 px-3 py-1 text-xs dark:border-slate-700">Reject</button>
                      <button type="button" disabled className="rounded-lg border border-slate-200 px-3 py-1 text-xs opacity-50 dark:border-slate-700">Prepare tenant record</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
