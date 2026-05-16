import { ExternalLink, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

export default function PublicDataDeletionPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <BrandLogo variant="header" showSubtitle />
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Privacy request</p>
              <h1 className="mt-2 text-3xl font-semibold">Delete your Tenaqo account or request data deletion</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Tenaqo supports account deletion, workspace closure, tenant data erasure, contractor data erasure, and membership removal requests. Because Tenaqo stores rental operations, finance, legal, tax, document, compliance, maintenance, billing, and audit records, some records may need to be retained or minimised instead of immediately deleted.
              </p>
            </div>
            <ShieldCheck className="text-emerald-600" size={32} />
          </div>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Trash2 size={18} />
              How to request deletion
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Signed-in users can open Settings {">"} Data & Privacy and submit a reviewed deletion request. If you cannot sign in, email privacy@oasisrental.app from the email address associated with your account and include your workspace name, role, and request type.
            </p>
            <Link
              to="/settings/data-privacy?request=user_account_deletion"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Open in-app deletion path <ExternalLink size={14} />
            </Link>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Mail size={18} />
              Contact
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Privacy support: privacy@oasisrental.app. We may ask you to verify your identity before processing deletion, export, tenant erasure, contractor erasure, or workspace closure requests.
            </p>
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold">What may happen to your data</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="font-medium">Deleted</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Device tokens, eligible notifications, expired exports, and unnecessary account metadata.</p>
            </div>
            <div>
              <h3 className="font-medium">Anonymised or restricted</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">User, tenant, or contractor profile fields such as name, email, phone, avatar, and avoidable free-text personal notes where safe.</p>
            </div>
            <div>
              <h3 className="font-medium">Retained with reasons</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Finance ledger, invoices, audit/security logs, compliance evidence, billing records, legal records, tax records, and dispute evidence.</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold">Response expectations</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Tenaqo records a request reference, reviews identity and retention obligations, performs eligible deletion or anonymisation through privileged server-side processing, and explains anything retained. We do not promise immediate deletion of all operational records.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Privacy policy: <a href="/privacy" className="font-medium text-blue-700 dark:text-blue-300">/privacy</a>
          </p>
        </section>
      </div>
    </main>
  );
}
