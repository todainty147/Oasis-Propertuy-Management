import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAccount } from "../../context/AccountContext";
import {
  calculateInspectionReportCounts,
  formatInspectionType,
  getConditionRatingLabel,
  sortBySortOrder,
} from "../../lib/evidenceVault";
import { getDocumentPreviewUrl } from "../../services/documentService";
import { getInspectionReportDetails } from "../../services/legalSecurityService";

function PrintPhoto({ photo, accountId, propertyId, tenantId }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!photo?.document_id) return () => { cancelled = true; };
    getDocumentPreviewUrl({
      documentId: photo.document_id,
      accountId,
      propertyId,
      tenantId,
      scope: propertyId && tenantId ? "shared" : propertyId ? "property" : tenantId ? "tenant" : "account",
      visibility: tenantId ? "tenant" : "staff",
    })
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accountId, photo?.document_id, propertyId, tenantId]);

  return (
    <div className="break-inside-avoid rounded border border-slate-200 p-2">
      {url ? <img src={url} alt={photo.caption || "Evidence photo"} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center bg-slate-100 text-xs text-slate-500">Photo unavailable</div>}
      <p className="mt-1 text-xs text-slate-600">{photo.caption || "Evidence file"}</p>
    </div>
  );
}

export default function EvidenceVaultPrintPage({ properties = [], tenants = [] }) {
  const { reportId } = useParams();
  const { activeAccountId } = useAccount();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const propertyById = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAccountId || !reportId) return () => { cancelled = true; };
    getInspectionReportDetails(activeAccountId, reportId)
      .then((nextReport) => {
        if (!cancelled) setReport(nextReport);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load print report.");
      });
    return () => { cancelled = true; };
  }, [activeAccountId, reportId]);

  const counts = calculateInspectionReportCounts(report || {});
  const property = propertyById[report?.property_id];
  const tenant = tenantById[report?.tenant_id];

  return (
    <main className="min-h-screen bg-white p-6 text-slate-950 print:p-0">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-room { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="mx-auto max-w-5xl">
        <div className="no-print mb-6 flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <Link to={`/documents/evidence-vault/${reportId}`} className="text-sm font-medium text-blue-700">Back to builder</Link>
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print / save PDF</button>
        </div>

        {error ? <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {!report && !error ? <p className="text-sm text-slate-500">Loading report...</p> : null}

        {report ? (
          <article>
            <header className="border-b border-slate-200 pb-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tenaqo Evidence Vault</p>
              <h1 className="mt-2 text-3xl font-bold">{report.title}</h1>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <p><strong>Property:</strong> {property?.address || property?.name || report.property_id}</p>
                <p><strong>Tenant:</strong> {tenant?.name || tenant?.email || "No tenant linked"}</p>
                <p><strong>Inspection type:</strong> {formatInspectionType(report.inspection_type)}</p>
                <p><strong>Inspection date:</strong> {report.inspection_date}</p>
                <p><strong>Status:</strong> {report.status}</p>
                <p><strong>Created:</strong> {report.created_at ? new Date(report.created_at).toLocaleString() : "Not recorded"}</p>
                {report.locked_at ? <p><strong>Locked:</strong> {new Date(report.locked_at).toLocaleString()}</p> : null}
                <p><strong>Summary:</strong> {counts.roomCount} rooms · {counts.itemCount} checklist items · {counts.photoCount} photos</p>
              </div>
            </header>

            <section className="mt-6 space-y-6">
              {sortBySortOrder(report.inspection_rooms || []).map((room) => (
                <div key={room.id} className="print-room rounded-lg border border-slate-200 p-4">
                  <h2 className="text-xl font-semibold">{room.room_name}</h2>
                  <div className="mt-3 space-y-4">
                    {sortBySortOrder(room.inspection_evidence_items || []).map((item) => (
                      <div key={item.id} className="break-inside-avoid border-t border-slate-200 pt-3">
                        <div className="flex items-start justify-between gap-4">
                          <h3 className="font-semibold">{item.item_label}</h3>
                          <span className="rounded-full border border-slate-300 px-3 py-1 text-xs">{getConditionRatingLabel(item.condition_rating)}</span>
                        </div>
                        {item.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.notes}</p> : <p className="mt-2 text-sm text-slate-500">No notes recorded.</p>}
                        {(item.inspection_photos || []).length > 0 ? (
                          <div className="mt-3 grid grid-cols-3 gap-3">
                            {item.inspection_photos.map((photo) => (
                              <PrintPhoto key={photo.id} photo={photo} accountId={activeAccountId} propertyId={report.property_id} tenantId={report.tenant_id} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
              This report is an organisational evidence record created in Tenaqo. It does not replace legal advice.
            </footer>
          </article>
        ) : null}
      </div>
    </main>
  );
}
