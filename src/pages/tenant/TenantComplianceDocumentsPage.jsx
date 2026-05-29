import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, FileText, HelpCircle, MessageSquare, X } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { getDocumentPreviewUrl } from "../../services/documentService";
import {
  getTenantComplianceAcknowledgement,
  listTenantComplianceAcknowledgements,
  markTenantComplianceAcknowledgementViewed,
  respondToComplianceAcknowledgement,
} from "../../services/legalSecurityService";

const REQUIRED_COPY =
  "I confirm that I have received/reviewed this document or compliance record. This acknowledgement does not replace legal advice.";

const statusLabels = {
  pending: "Ready for review",
  viewed: "Viewed",
  acknowledged: "Acknowledged",
  disputed: "Question / dispute submitted",
  revoked: "Revoked",
};

function panelClass() {
  return "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
}

function propertyLabel(properties, propertyId) {
  const property = properties.find((entry) => String(entry.id) === String(propertyId));
  return property?.address || property?.name || "Property";
}

function ComplianceDocumentLink({ accountId, acknowledgement }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const item = acknowledgement?.tenancy_compliance_items;
  const documentId = item?.evidence_document_id;

  useEffect(() => {
    let cancelled = false;
    if (!accountId || !documentId) return () => { cancelled = true; };
    getDocumentPreviewUrl({
      accountId,
      documentId,
      propertyId: item?.property_id || null,
      tenantId: item?.tenant_id || null,
    })
      .then((nextUrl) => {
        if (!cancelled) setUrl(nextUrl || "");
      })
      .catch(() => {
        if (!cancelled) setError("Document preview is not available from this portal.");
      });
    return () => { cancelled = true; };
  }, [accountId, documentId, item?.property_id, item?.tenant_id]);

  if (!documentId) return <p className="text-sm text-slate-500">No document is attached yet.</p>;
  if (error) return <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{error}</p>;
  if (!url) return <p className="text-sm text-slate-500">Preparing secure document preview...</p>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800">
      <FileText size={15} /> View attached document
    </a>
  );
}

export default function TenantComplianceDocumentsPage({ properties = [] }) {
  const { activeAccountId } = useAccount();
  const { acknowledgementId } = useParams();
  const navigate = useNavigate();
  const [acknowledgements, setAcknowledgements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      setLoading(true);
      setError("");
      const [list, detail] = await Promise.all([
        listTenantComplianceAcknowledgements(activeAccountId),
        acknowledgementId ? getTenantComplianceAcknowledgement(activeAccountId, acknowledgementId) : Promise.resolve(null),
      ]);
      setAcknowledgements(list);
      setSelected(detail);
      if (detail?.acknowledgement_status === "pending") {
        markTenantComplianceAcknowledgementViewed(activeAccountId, detail.id).catch(() => {});
      }
    } catch (err) {
      setError(err?.message || "Could not load compliance documents.");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, acknowledgementId]);

  useEffect(() => { load(); }, [load]);

  const selectedItem = selected?.tenancy_compliance_items || null;
  const requirement = selectedItem?.compliance_requirements || {};
  const template = requirement?.compliance_templates || {};
  const listMode = !acknowledgementId;

  async function respond(disputed = false) {
    if (!selected) return;
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await respondToComplianceAcknowledgement(activeAccountId, selected.id, { disputed, comment });
      setSuccess(disputed ? "Your question or dispute has been submitted." : "Acknowledgement recorded.");
      await load();
    } catch (err) {
      setError(err?.message || "Could not submit your response.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className={panelClass()}>
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">Tenant portal</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Compliance Documents</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Review compliance documents shared by your landlord. You can acknowledge receipt/review or add a question without editing the landlord record.
        </p>
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-950/60 px-4 py-3 text-sm text-rose-100">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button>
        </div>
      ) : null}
      {success ? <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{success}</p> : null}

      {loading ? <div className={panelClass()}>Loading compliance documents...</div> : null}

      {!loading && listMode ? (
        <div className="grid gap-3 md:grid-cols-2">
          {acknowledgements.length === 0 ? (
            <div className={`${panelClass()} md:col-span-2`}>
              <p className="text-sm text-slate-500">No compliance documents have been shared with you yet.</p>
            </div>
          ) : acknowledgements.map((ack) => {
            const item = ack.tenancy_compliance_items || {};
            const req = item.compliance_requirements || {};
            return (
              <button
                key={ack.id}
                type="button"
                onClick={() => navigate(`/tenant/compliance-documents/${ack.id}`)}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-400 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-xs uppercase text-slate-500">{statusLabels[ack.acknowledgement_status] || ack.acknowledgement_status}</p>
                <h2 className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{req.label || "Compliance document"}</h2>
                <p className="mt-1 text-sm text-slate-500">{propertyLabel(properties, item.property_id)}</p>
                <p className="mt-3 text-xs text-slate-500">Shared {new Date(ack.created_at).toLocaleDateString()}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      {!loading && !listMode && selected ? (
        <div className={panelClass()}>
          <button type="button" onClick={() => navigate("/tenant/compliance-documents")} className="text-sm font-semibold text-teal-600 dark:text-teal-300">Back to Compliance Documents</button>
          <div className="mt-4">
            <p className="text-xs uppercase text-slate-500">{template.name || "Compliance checklist"}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-50">{requirement.label || "Compliance document"}</h2>
            <p className="mt-2 text-sm text-slate-500">{propertyLabel(properties, selectedItem?.property_id)}</p>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm text-slate-600 dark:text-slate-300">{requirement.description || "Review the document or compliance record shared with you."}</p>
            {selected.message ? <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-900">{selected.message}</p> : null}
          </div>
          <div className="mt-4">
            <ComplianceDocumentLink key={selectedItem?.evidence_document_id || selected.id} accountId={activeAccountId} acknowledgement={selected} />
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="font-semibold text-slate-950 dark:text-slate-50">Your response</h3>
            <p className="mt-2 text-sm text-slate-500">{REQUIRED_COPY}</p>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              placeholder="Optional comment or question"
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              disabled={["acknowledged", "disputed", "revoked"].includes(selected.acknowledgement_status)}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || ["acknowledged", "disputed", "revoked"].includes(selected.acknowledgement_status)}
                onClick={() => respond(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
              >
                <CheckCircle2 size={16} /> Acknowledge receipt/review
              </button>
              <button
                type="button"
                disabled={saving || ["acknowledged", "disputed", "revoked"].includes(selected.acknowledgement_status)}
                onClick={() => respond(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60"
              >
                <HelpCircle size={16} /> I have a question / dispute
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !listMode && !selected ? (
        <div className={panelClass()}>
          <MessageSquare size={20} className="text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">This compliance document is no longer available.</p>
        </div>
      ) : null}
    </div>
  );
}
