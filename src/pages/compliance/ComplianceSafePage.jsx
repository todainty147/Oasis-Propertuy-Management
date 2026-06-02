import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Link2,
  Plus,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import RiskProtectionSummary from "../../components/risk/RiskProtectionSummary";
import { useAccount } from "../../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import { getRiskProtectionSummary } from "../../lib/riskProtectionSummary";
import {
  calculateComplianceRating,
  COMPLIANCE_SAFE_STATUS_LABELS,
  deriveComplianceItemStatus,
} from "../../utils/complianceSafe";
import { fetchDocuments, uploadDocument } from "../../services/documentService";
import {
  attachComplianceDocument,
  createComplianceChecklistFromTemplate,
  getComplianceSafeItemDetails,
  linkComplianceInspectionReport,
  listComplianceEvidenceEvents,
  listComplianceSafeItems,
  listComplianceTemplates,
  listInspectionReports,
  requestComplianceTenantAcknowledgement,
  revokeComplianceTenantAcknowledgement,
  updateComplianceSafeItem,
} from "../../services/legalSecurityService";

const SAFE_COPY =
  "Track tenancy documents, safety certificates, deposit evidence and tenant acknowledgements in one organised compliance checklist. Tenaqo helps organise evidence and does not replace legal advice.";

const fieldClass =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";

function panelClass() {
  return "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
}

function statusTone(status) {
  if (status === "acknowledged" || status === "logged") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (status === "expiring_soon") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (status === "expired" || status === "needs_review") return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  if (status === "not_applicable") return "border-slate-600 bg-slate-800 text-slate-300";
  return "border-slate-600 bg-slate-950 text-slate-300";
}

function formatDate(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString();
}

function propertyLabel(properties, propertyId) {
  const property = properties.find((entry) => String(entry.id) === String(propertyId));
  return property?.address || property?.name || propertyId || "No property selected";
}

function tenantLabel(tenants, tenantId) {
  const tenant = tenants.find((entry) => String(entry.id) === String(tenantId));
  return tenant?.name || tenant?.email || tenantId || "No tenant linked";
}

function latestAcknowledgement(item) {
  return [...(item?.compliance_item_acknowledgements || [])]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null;
}

function ComplianceItemDrawer({
  item,
  properties,
  tenants,
  documents,
  reports,
  events,
  tenantAckEnabled,
  onClose,
  onAttachDocument,
  onUploadDocument,
  onLinkReport,
  onUpdateItem,
  onRequestAcknowledgement,
  onRevokeAcknowledgement,
  busy,
}) {
  const uploadRef = useRef(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState(item?.evidence_document_id || "");
  const [selectedReportId, setSelectedReportId] = useState(
    item?.evidence_source_type === "inspection_report" ? item?.evidence_source_id || "" : "",
  );
  const [draft, setDraft] = useState({
    notes: item?.notes || "",
    expires_at: item?.expires_at || "",
    served_at: item?.served_at ? String(item.served_at).slice(0, 10) : "",
    needs_review_reason: item?.needs_review_reason || "",
    acknowledgementMessage: "",
  });
  const acknowledgement = latestAcknowledgement(item);
  const status = deriveComplianceItemStatus(item);
  const requirement = item?.compliance_requirements || {};
  const template = requirement?.compliance_templates || {};
  const linkedReport = item?.evidence_source_type === "inspection_report"
    ? reports.find((report) => String(report.id) === String(item.evidence_source_id))
    : null;

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70">
      <button type="button" aria-label="Close details" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Compliance item</p>
            <h2 className="mt-1 text-xl font-semibold">{requirement.label || "Compliance item"}</h2>
            <p className="mt-2 text-sm text-slate-400">{propertyLabel(properties, item.property_id)} · {tenantLabel(tenants, item.tenant_id)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 p-2 text-slate-300 hover:bg-slate-900">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 font-semibold ${statusTone(status)}`}>{COMPLIANCE_SAFE_STATUS_LABELS[status]}</span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{template.name || "Template"}</span>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{template.country_code || "Jurisdiction"} / {template.jurisdiction || "template"}</span>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold">Requirement guidance</h3>
          <p className="mt-2 text-sm text-slate-300">{requirement.description || "Record the evidence and review details for this requirement."}</p>
          <p className="mt-2 text-xs text-slate-500">This is an organisational compliance record. It does not replace legal advice.</p>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase text-slate-500">Evidence</p>
            <p className="mt-2 text-sm">{item.evidence_document_id ? "Evidence attached" : item.evidence_source_type === "inspection_report" ? "Inspection report linked" : "No evidence attached"}</p>
            <p className="mt-1 text-xs text-slate-500">Served/sent: {formatDate(item.served_at)}</p>
            {linkedReport ? (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-sm font-semibold text-slate-100">{linkedReport.title || "Evidence Vault report"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {linkedReport.status || "draft"} · {linkedReport.inspection_date || "No inspection date"}
                  {linkedReport.locked_at ? " · locked" : ""}
                </p>
                <Link
                  to={`/documents/evidence-vault/${linkedReport.id}`}
                  className="mt-2 inline-flex text-xs font-semibold text-blue-300 hover:text-blue-200"
                >
                  Open Evidence Vault report
                </Link>
              </div>
            ) : item.evidence_source_type === "inspection_report" ? (
              <p className="mt-2 text-xs text-amber-200">Linked report details are unavailable from the current property filter.</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase text-slate-500">Tenant acknowledgement</p>
            <p className="mt-2 text-sm">{acknowledgement?.acknowledgement_status || "Not requested"}</p>
            <p className="mt-1 text-xs text-slate-500">Acknowledged: {formatDate(item.acknowledged_by_tenant_at || acknowledgement?.acknowledged_at)}</p>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold">Evidence attachment</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <select className={fieldClass} value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}>
              <option value="">Attach existing document</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>{document.filename || document.original_filename || document.title || document.id}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedDocumentId || selectedDocumentId === item.evidence_document_id}
              onClick={() => onAttachDocument(item, selectedDocumentId)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60"
            >
              <Link2 size={15} /> Attach document
            </button>
            <button type="button" disabled={busy} onClick={() => uploadRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60">
              <Upload size={15} /> Upload document
            </button>
            <input
              ref={uploadRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadDocument(item, file);
                event.target.value = "";
              }}
            />
            <select className={fieldClass} value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}>
              <option value="">Link Evidence Vault report</option>
              {reports.map((report) => (
                <option key={report.id} value={report.id}>{report.title} · {report.inspection_date}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedReportId || (item.evidence_source_type === "inspection_report" && selectedReportId === item.evidence_source_id)}
              onClick={() => onLinkReport(item, selectedReportId)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60"
            >
              <Link2 size={15} /> Link report
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold">Dates and notes</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="text-xs uppercase text-slate-500">Served/sent date</span>
              <input type="date" value={draft.served_at} onChange={(event) => setDraft((current) => ({ ...current, served_at: event.target.value }))} className={`${fieldClass} mt-1 w-full`} />
            </label>
            <label className="text-sm">
              <span className="text-xs uppercase text-slate-500">Expiry date</span>
              <input type="date" value={draft.expires_at} onChange={(event) => setDraft((current) => ({ ...current, expires_at: event.target.value }))} className={`${fieldClass} mt-1 w-full`} />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-xs uppercase text-slate-500">Notes</span>
            <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={4} className={`${fieldClass} mt-1 w-full`} />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => onUpdateItem(item, { notes: draft.notes, expires_at: draft.expires_at, served_at: draft.served_at })}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            <CheckCircle2 size={15} /> Save changes
          </button>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold">Tenant acknowledgement</h3>
          {!tenantAckEnabled ? (
            <p className="mt-2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-400">Tenant acknowledgement is disabled for this account.</p>
          ) : !item.tenant_id ? (
            <p className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">Link a tenant to this checklist item before requesting acknowledgement.</p>
          ) : acknowledgement && acknowledgement.acknowledgement_status !== "revoked" ? (
            <div className="mt-2 space-y-2 text-sm text-slate-300">
              <p>Status: <span className="font-semibold text-slate-100">{acknowledgement.acknowledgement_status}</span></p>
              {acknowledgement.comment ? <p className="rounded-xl bg-slate-950 p-3">{acknowledgement.comment}</p> : null}
              <button type="button" disabled={busy} onClick={() => onRevokeAcknowledgement(acknowledgement.id)} className="rounded-lg border border-rose-400/40 px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-60">Revoke request</button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <textarea
                value={draft.acknowledgementMessage}
                onChange={(event) => setDraft((current) => ({ ...current, acknowledgementMessage: event.target.value }))}
                rows={3}
                placeholder="Optional message for the tenant"
                className={`${fieldClass} w-full`}
              />
              <button type="button" disabled={busy} onClick={() => onRequestAcknowledgement(item, draft.acknowledgementMessage)} className="inline-flex items-center gap-2 rounded-lg border border-teal-400/40 bg-teal-400/10 px-3 py-2 text-sm font-semibold text-teal-100 disabled:opacity-60">
                <Send size={15} /> Request tenant acknowledgement
              </button>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold">Audit history</h3>
          <div className="mt-3 space-y-2">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No activity recorded yet.</p>
            ) : events.map((event) => (
              <div key={event.id} className="rounded-xl bg-slate-950 p-3 text-sm">
                <p className="font-medium text-slate-100">{event.event_type}</p>
                <p className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

export default function ComplianceSafePage({ properties = [], tenants = [] }) {
  const { activeAccountId, hasEntitlement } = useAccount();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ propertyId: "", tenantId: "", status: "" });
  const [templates, setTemplates] = useState([]);
  const [checklistForm, setChecklistForm] = useState({ propertyId: "", tenantId: "", templateId: "" });
  const [documents, setDocuments] = useState([]);
  const [reports, setReports] = useState([]);
  const [summaryReports, setSummaryReports] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemLoading, setSelectedItemLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingChecklist, setCreatingChecklist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedItemLoadSeq = useRef(0);
  const tenantAckEnabled = hasEntitlement(ENTITLEMENT_FEATURES.COMPLIANCE_SAFE_TENANT_ACKNOWLEDGEMENT);

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      setLoading(true);
      setError("");
      const [nextItems, nextReports] = await Promise.all([
        listComplianceSafeItems(activeAccountId, {
          propertyId: filters.propertyId,
          tenantId: filters.tenantId,
        }),
        listInspectionReports(activeAccountId),
      ]);
      setItems(nextItems);
      setSummaryReports(nextReports);
    } catch (err) {
      setError(err?.message || "Could not load Compliance Safe records.");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, filters.propertyId, filters.tenantId]);

  const loadSelectedItem = useCallback(async (itemId) => {
    if (!activeAccountId || !itemId) {
      setSelectedItem(null);
      setEvents([]);
      return;
    }
    const loadSeq = ++selectedItemLoadSeq.current;
    setSelectedItemLoading(true);
    setDocuments([]);
    setReports([]);
    const [detail, nextEvents] = await Promise.all([
      getComplianceSafeItemDetails(activeAccountId, itemId),
      listComplianceEvidenceEvents(activeAccountId, itemId),
    ]);
    if (loadSeq !== selectedItemLoadSeq.current) return;
    setSelectedItem(detail);
    setEvents(nextEvents);
    if (detail?.property_id) {
      const [nextDocuments, nextReports] = await Promise.all([
        fetchDocuments({ accountId: activeAccountId, propertyId: detail.property_id, tenantId: detail.tenant_id || null }),
        listInspectionReports(activeAccountId, { propertyId: detail.property_id, tenantId: detail.tenant_id || null }),
      ]);
      if (loadSeq !== selectedItemLoadSeq.current) return;
      setDocuments(nextDocuments);
      setReports(nextReports);
    }
    if (loadSeq === selectedItemLoadSeq.current) setSelectedItemLoading(false);
  }, [activeAccountId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedItemId) {
      selectedItemLoadSeq.current += 1;
      setSelectedItem(null);
      setEvents([]);
      setSelectedItemLoading(false);
      return () => { cancelled = true; };
    }
    loadSelectedItem(selectedItemId)
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load compliance item.");
      })
      .finally(() => {
        if (!cancelled) setSelectedItemLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedItemId, loadSelectedItem]);

  useEffect(() => {
    let cancelled = false;
    listComplianceTemplates()
      .then((nextTemplates) => {
        if (cancelled) return;
        setTemplates(nextTemplates);
        setChecklistForm((form) => ({ ...form, templateId: form.templateId || nextTemplates[0]?.id || "" }));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load compliance templates.");
      });
    return () => { cancelled = true; };
  }, []);

  const visibleItems = useMemo(
    () => filters.status ? items.filter((item) => deriveComplianceItemStatus(item) === filters.status) : items,
    [filters.status, items],
  );
  const rating = useMemo(() => calculateComplianceRating(items), [items]);
  const riskSummary = useMemo(
    () => getRiskProtectionSummary({ complianceItems: items, evidenceReports: summaryReports }),
    [items, summaryReports],
  );

  async function refreshAfterAction(itemId = selectedItemId) {
    await load();
    if (itemId) await loadSelectedItem(itemId);
  }

  async function updateStatus(item, status) {
    try {
      setBusy(true);
      await updateComplianceSafeItem(item.id, activeAccountId, { status });
      await refreshAfterAction(item.id);
    } catch (err) {
      setError(err?.message || "Could not update compliance item.");
    } finally {
      setBusy(false);
    }
  }

  async function createChecklist(event) {
    event.preventDefault();
    if (creatingChecklist) return;
    try {
      setCreatingChecklist(true);
      setError("");
      await createComplianceChecklistFromTemplate(activeAccountId, checklistForm);
      await load();
      setChecklistForm({ propertyId: "", tenantId: "", templateId: templates[0]?.id || "" });
    } catch (err) {
      setError(err?.message || "Could not create compliance checklist.");
    } finally {
      setCreatingChecklist(false);
    }
  }

  async function handleUploadDocument(item, file) {
    try {
      setBusy(true);
      const document = await uploadDocument({
        accountId: activeAccountId,
        propertyId: item.property_id,
        tenantId: item.tenant_id || null,
        file,
        tags: ["compliance_safe"],
        scope: item.property_id && item.tenant_id ? "shared" : item.property_id ? "property" : "account",
        visibility: item.tenant_id ? "tenant" : "staff",
      });
      await attachComplianceDocument(activeAccountId, item.id, document.id);
      await refreshAfterAction(item.id);
    } catch (err) {
      setError(err?.message || "Could not upload compliance evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(action) {
    try {
      setBusy(true);
      await action();
      await refreshAfterAction();
    } catch (err) {
      setError(err?.message || "Could not update Compliance Safe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Compliance</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Compliance Safe</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{SAFE_COPY}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Compliance rating</p><p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-slate-50">{rating.rating}%</p></div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Missing</p><p className="mt-2 text-2xl font-semibold">{rating.counts.missing}</p></div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Expiring soon</p><p className="mt-2 text-2xl font-semibold">{rating.counts.expiring_soon}</p></div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Expired</p><p className="mt-2 text-2xl font-semibold">{rating.counts.expired}</p></div>
        <div className={panelClass()}><p className="text-xs uppercase text-slate-500">Needs review</p><p className="mt-2 text-2xl font-semibold">{rating.counts.needs_review}</p></div>
      </div>

      <RiskProtectionSummary summary={riskSummary} complianceRating={rating.rating} />

      {hasEntitlement(ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER) ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">EPC & Eco-Upgrade Plan</p>
              <p>Link EPC certificate records, review EPC band signals and open the Eco-Upgrade Planner for indicative upgrade paths.</p>
            </div>
            <Link to="/portfolio-health/eco-upgrade-planner" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
              Open Eco-Upgrade Planner
            </Link>
          </div>
        </div>
      ) : null}

      <div className={`${panelClass()} grid gap-3 md:grid-cols-3`}>
        <select value={filters.propertyId} onChange={(e) => setFilters((f) => ({ ...f, propertyId: e.target.value }))} className={fieldClass}>
          <option value="">All properties</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.name || property.id}</option>)}
        </select>
        <select value={filters.tenantId} onChange={(e) => setFilters((f) => ({ ...f, tenantId: e.target.value }))} className={fieldClass}>
          <option value="">All tenants</option>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email || tenant.id}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={fieldClass}>
          <option value="">All statuses</option>
          {Object.entries(COMPLIANCE_SAFE_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      <form onSubmit={createChecklist} className={panelClass()}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-slate-50">Create checklist from template</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a property, optional tenant, and template. Only missing checklist items will be created, so rerunning a template is safe.</p>
          </div>
          <button type="submit" disabled={creatingChecklist} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"><Plus size={16} /> {creatingChecklist ? "Creating..." : "Create checklist"}</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select required value={checklistForm.propertyId} onChange={(e) => setChecklistForm((f) => ({ ...f, propertyId: e.target.value }))} className={fieldClass}>
            <option value="">Property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.name || property.id}</option>)}
          </select>
          <select value={checklistForm.tenantId} onChange={(e) => setChecklistForm((f) => ({ ...f, tenantId: e.target.value }))} className={fieldClass}>
            <option value="">Tenant optional</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email || tenant.id}</option>)}
          </select>
          <select required value={checklistForm.templateId} onChange={(e) => setChecklistForm((f) => ({ ...f, templateId: e.target.value }))} className={fieldClass}>
            <option value="">Template</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </div>
      </form>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-950/60 dark:text-rose-100">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button>
        </div>
      ) : null}
      {loading ? <div className={panelClass()}>Loading Compliance Safe...</div> : null}

      {!loading && (
        <div className="space-y-3">
          {visibleItems.length === 0 ? (
            <div className={panelClass()}>
              <p className="text-sm text-slate-500">{items.length === 0 ? "No compliance checklist items yet. Create a UK/England or Poland checklist to start logging evidence." : "No checklist items match these filters."}</p>
            </div>
          ) : visibleItems.map((item) => {
            const status = deriveComplianceItemStatus(item);
            const ack = latestAcknowledgement(item);
            const evidenceLabel = item.evidence_document_id || item.evidence_source_id ? "Evidence attached" : "No evidence";
            return (
              <div key={item.id} className={panelClass()}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck size={17} className="text-teal-600" />
                      <h2 className="font-semibold text-slate-950 dark:text-slate-50">{item.compliance_requirements?.label || "Compliance item"}</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}>{COMPLIANCE_SAFE_STATUS_LABELS[status]}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{propertyLabel(properties, item.property_id)}</span>
                      <span>·</span>
                      <span>{tenantLabel(tenants, item.tenant_id)}</span>
                      <span>·</span>
                      <span>{evidenceLabel}</span>
                      {item.expires_at ? <><span>·</span><span>Expires {formatDate(item.expires_at)}</span></> : null}
                      <span>·</span>
                      <span>Ack: {ack?.acknowledgement_status || "Not requested"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!["logged", "acknowledged"].includes(status) ? (
                      <button type="button" disabled={busy} onClick={() => updateStatus(item, "logged")} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"><FileText size={14} /> Mark as logged</button>
                    ) : null}
                    {status !== "not_applicable" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Mark this requirement as not applicable? It will be excluded from the compliance rating.")) {
                            updateStatus(item, "not_applicable");
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-slate-700"
                      >
                        <CheckCircle2 size={14} /> Not applicable
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setSelectedItemId(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-700"><AlertCircle size={14} /> Open details</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItemLoading && !selectedItem ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70">
          <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-2xl">
            <p className="text-sm text-slate-400">Loading compliance item details...</p>
          </aside>
        </div>
      ) : null}

      {selectedItem ? (
        <ComplianceItemDrawer
          key={`${selectedItem.id}_${selectedItem.updated_at || ""}`}
          item={selectedItem}
          properties={properties}
          tenants={tenants}
          documents={documents}
          reports={reports}
          events={events}
          tenantAckEnabled={tenantAckEnabled}
          busy={busy}
          onClose={() => { setSelectedItemId(""); setSelectedItem(null); }}
          onAttachDocument={(item, documentId) => handleAction(() => attachComplianceDocument(activeAccountId, item.id, documentId))}
          onUploadDocument={handleUploadDocument}
          onLinkReport={(item, reportId) => handleAction(() => linkComplianceInspectionReport(activeAccountId, item.id, reportId))}
          onUpdateItem={(item, patch) => handleAction(() => updateComplianceSafeItem(item.id, activeAccountId, patch))}
          onRequestAcknowledgement={(item, message) => handleAction(() => requestComplianceTenantAcknowledgement(activeAccountId, item.id, { tenantId: item.tenant_id, message }))}
          onRevokeAcknowledgement={(ackId) => handleAction(() => revokeComplianceTenantAcknowledgement(activeAccountId, ackId))}
        />
      ) : null}
    </div>
  );
}
