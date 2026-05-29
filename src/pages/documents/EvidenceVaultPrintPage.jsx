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

  useEffect(() => {
    document.body.classList.add("evidence-vault-print-mode");
    return () => document.body.classList.remove("evidence-vault-print-mode");
  }, []);

  const counts = calculateInspectionReportCounts(report || {});
  const property = propertyById[report?.property_id];
  const tenant = tenantById[report?.tenant_id];
  const activeShare = (report?.inspection_report_shares || []).find((share) => !share.revoked_at && !["revoked", "expired"].includes(share.share_status));
  const tenantSignature = (report?.inspection_signatures || []).find((signature) => signature.signer_role === "tenant" || signature.signer_type === "tenant");
  const landlordSignatures = (report?.inspection_signatures || []).filter((signature) => signature.signer_role !== "tenant" && signature.signer_type !== "tenant");
  const tenantComments = activeShare?.inspection_report_tenant_comments || [];

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-950 dark:bg-slate-100 print:bg-white print:p-0">
      <style>{`
        .evidence-print-document {
          color: #0f172a;
          background: white;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body {
            background: white !important;
            overflow: visible !important;
          }
          body.evidence-vault-print-mode > div,
          body.evidence-vault-print-mode .tenaqo-app-surface,
          body.evidence-vault-print-mode main {
            display: block !important;
            overflow: visible !important;
            background: white !important;
          }
          body.evidence-vault-print-mode aside,
          body.evidence-vault-print-mode header,
          body.evidence-vault-print-mode nav,
          body.evidence-vault-print-mode .tenaqo-app-surface > header,
          body.evidence-vault-print-mode [class*="MobileBottomNav"] {
            display: none !important;
          }
          .no-print { display: none !important; }
          .evidence-print-shell {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .evidence-print-document {
            box-shadow: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
          }
          .print-room { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="evidence-print-shell mx-auto max-w-5xl">
        <div className="no-print mb-6 flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <Link to={`/documents/evidence-vault/${reportId}`} className="text-sm font-medium text-blue-700">Back to builder</Link>
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print / save PDF</button>
        </div>

        {error ? <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {!report && !error ? <p className="text-sm text-slate-500">Loading report...</p> : null}

        {report ? (
          <article className="evidence-print-document min-h-[297mm] rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
            <section className="border-b-4 border-slate-950 pb-6">
              <div className="flex items-start justify-between gap-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tenaqo Evidence Vault</p>
                  <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">{report.title}</h1>
                  <p className="mt-2 text-sm text-slate-600">Inspection record for deposit dispute preparation and property evidence organisation.</p>
                </div>
                <div className="min-w-36 rounded-xl border border-slate-300 px-4 py-3 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</p>
                  <p className="mt-1 text-lg font-bold capitalize text-slate-950">{report.status}</p>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 border-b border-slate-300 pb-6 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Property</p>
                <p className="mt-1 font-semibold text-slate-950">{property?.address || property?.name || report.property_id}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tenant</p>
                <p className="mt-1 font-semibold text-slate-950">{tenant?.name || tenant?.email || "No tenant linked"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Inspection type</p>
                <p className="mt-1 font-semibold text-slate-950">{formatInspectionType(report.inspection_type)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Inspection date</p>
                <p className="mt-1 font-semibold text-slate-950">{report.inspection_date}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Created</p>
                <p className="mt-1 font-semibold text-slate-950">{report.created_at ? new Date(report.created_at).toLocaleString() : "Not recorded"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Summary</p>
                <p className="mt-1 font-semibold text-slate-950">{counts.roomCount} rooms · {counts.itemCount} checklist items · {counts.photoCount} photos</p>
              </div>
              {report.locked_at ? (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Locked</p>
                  <p className="mt-1 font-semibold text-slate-950">{new Date(report.locked_at).toLocaleString()}</p>
                </div>
              ) : null}
            </section>

            <section className="mt-6">
              <h2 className="text-lg font-bold text-slate-950">Signatures and tenant response</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-300 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Landlord / agent signature</p>
                  {landlordSignatures.length === 0 ? <p className="mt-2 text-sm text-slate-600">No landlord acknowledgement recorded.</p> : null}
                  {landlordSignatures.map((signature) => (
                    <p key={signature.id} className="mt-2 text-sm text-slate-800">
                      <span className="font-semibold">{signature.signer_name}</span> · {signature.signer_type} · {signature.signed_at ? new Date(signature.signed_at).toLocaleString() : "Time not recorded"}
                    </p>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-300 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tenant signature</p>
                  {tenantSignature ? (
                    <p className="mt-2 text-sm text-slate-800">
                      <span className="font-semibold">{tenantSignature.signer_name}</span> · {tenantSignature.signed_at ? new Date(tenantSignature.signed_at).toLocaleString() : "Time not recorded"}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">Tenant signature: not yet provided</p>
                  )}
                  <p className="mt-2 text-xs text-slate-600">Tenant response: {activeShare?.share_status ? String(activeShare.share_status).replace(/_/g, " ") : "not shared"}</p>
                  <p className="mt-1 text-xs text-slate-600">Viewed: {activeShare?.viewed_at ? new Date(activeShare.viewed_at).toLocaleString() : "Not recorded"}</p>
                  <p className="mt-1 text-xs text-slate-600">Responded: {activeShare?.responded_at ? new Date(activeShare.responded_at).toLocaleString() : "Not recorded"}</p>
                </div>
              </div>
              {tenantComments.length > 0 ? (
                <div className="mt-4 rounded-lg border border-slate-300 p-4">
                  <h3 className="font-bold text-slate-950">Tenant comments and disputes</h3>
                  <div className="mt-3 space-y-3">
                    {tenantComments.map((comment) => (
                      <div key={comment.id} className="break-inside-avoid border-t border-slate-200 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{comment.comment_type}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="mt-6">
              <h2 className="text-lg font-bold text-slate-950">Room-by-room inspection record</h2>
              {counts.roomCount === 0 ? (
                <p className="mt-3 rounded-lg border border-slate-300 p-4 text-sm text-slate-600">No room evidence sections have been added to this report yet.</p>
              ) : null}
              <div className="mt-4 space-y-5">
                {sortBySortOrder(report.inspection_rooms || []).map((room) => (
                  <div key={room.id} className="print-room rounded-lg border border-slate-300 p-4">
                    <h3 className="text-xl font-bold text-slate-950">{room.room_name}</h3>
                    <div className="mt-3 space-y-4">
                      {sortBySortOrder(room.inspection_evidence_items || []).map((item) => (
                        <div key={item.id} className="break-inside-avoid border-t border-slate-200 pt-3">
                          <div className="flex items-start justify-between gap-4">
                            <h4 className="font-bold text-slate-950">{item.item_label}</h4>
                            <span className="rounded-full border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-800">{getConditionRatingLabel(item.condition_rating)}</span>
                          </div>
                          {item.notes ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.notes}</p> : <p className="mt-2 text-sm text-slate-500">No notes recorded.</p>}
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
              </div>
            </section>

            <footer className="mt-8 border-t border-slate-300 pt-4 text-xs leading-5 text-slate-600">
              This report is an organisational evidence record created in Tenaqo. It does not replace legal advice.
            </footer>
          </article>
        ) : null}
      </div>
    </main>
  );
}
