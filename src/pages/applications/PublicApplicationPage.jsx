import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { submitPublicRentalApplication } from "../../services/legalSecurityService";

const INITIAL_FORM = {
  applicant_name: "",
  applicant_email: "",
  applicant_phone: "",
  preferred_move_in_date: "",
  occupants_count: "",
  pets_status: "",
  smoking_status: "",
  estimated_income_band: "",
  employment_status: "",
  guarantor_available: false,
  message: "",
  consent_accepted: false,
};

const fieldClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function PublicApplicationPage() {
  const publicToken = useMemo(() => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }, []);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.consent_accepted) {
      setError("Please accept the privacy notice before sending your enquiry.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await submitPublicRentalApplication(publicToken, {
        ...form,
        occupants_count: Number(form.occupants_count) || null,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "This application link is unavailable or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Tenaqo application link</p>
          <h1 className="mt-2 text-2xl font-semibold">Rental application</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your information will be shared with the landlord or property manager for the purpose of reviewing your rental enquiry.
          </p>
        </div>

        {submitted ? (
          <div className="mt-6 rounded-3xl border border-teal-200 bg-teal-50 p-6 text-teal-900">
            <CheckCircle2 size={24} />
            <h2 className="mt-3 text-xl font-semibold">Application sent</h2>
            <p className="mt-2 text-sm">Your rental enquiry has been recorded. The landlord or property manager can now review it inside Tenaqo.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <input required className={fieldClass} placeholder="Name" value={form.applicant_name} onChange={(e) => update("applicant_name", e.target.value)} />
              <input required type="email" className={fieldClass} placeholder="Email" value={form.applicant_email} onChange={(e) => update("applicant_email", e.target.value)} />
              <input className={fieldClass} placeholder="Phone" value={form.applicant_phone} onChange={(e) => update("applicant_phone", e.target.value)} />
              <input type="date" className={fieldClass} value={form.preferred_move_in_date} onChange={(e) => update("preferred_move_in_date", e.target.value)} />
              <input type="number" min="1" className={fieldClass} placeholder="Number of occupants" value={form.occupants_count} onChange={(e) => update("occupants_count", e.target.value)} />
              <select className={fieldClass} value={form.pets_status} onChange={(e) => update("pets_status", e.target.value)}>
                <option value="">Pets</option>
                <option value="no_pets">No pets</option>
                <option value="has_pets">Has pets</option>
              </select>
              <select className={fieldClass} value={form.smoking_status} onChange={(e) => update("smoking_status", e.target.value)}>
                <option value="">Smoking</option>
                <option value="non_smoker">Non-smoker</option>
                <option value="smoker">Smoker</option>
              </select>
              <select className={fieldClass} value={form.estimated_income_band} onChange={(e) => update("estimated_income_band", e.target.value)}>
                <option value="">Estimated annual income band</option>
                <option value="under_20k">Under 20k</option>
                <option value="20k_30k">20k to 30k</option>
                <option value="30k_45k">30k to 45k</option>
                <option value="45k_60k">45k to 60k</option>
                <option value="60k_plus">60k plus</option>
              </select>
              <select className={fieldClass} value={form.employment_status} onChange={(e) => update("employment_status", e.target.value)}>
                <option value="">Employment status</option>
                <option value="employed">Employed</option>
                <option value="self_employed">Self-employed</option>
                <option value="student">Student</option>
                <option value="retired">Retired</option>
                <option value="other">Other</option>
              </select>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={form.guarantor_available} onChange={(e) => update("guarantor_available", e.target.checked)} />
                Guarantor available
              </label>
            </div>
            <textarea className={`${fieldClass} min-h-28 w-full`} placeholder="Message" value={form.message} onChange={(e) => update("message", e.target.value)} />
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input className="mt-1" type="checkbox" checked={form.consent_accepted} onChange={(e) => update("consent_accepted", e.target.checked)} />
              <span>I consent to this information being shared with the landlord or property manager for rental enquiry review.</span>
            </label>
            <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
              {submitting ? "Sending..." : "Send application"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
