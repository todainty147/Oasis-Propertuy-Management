import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAccount } from "../../context/AccountContext";
import {
  buildDisputeTimeline,
  buildEvidenceIndex,
  calculateDeductionTotal,
  compareInspectionReports,
  formatDisputePackMoney,
} from "../../lib/depositDisputePack";
import {
  formatInspectionType,
  getConditionRatingLabel,
  sortBySortOrder,
} from "../../lib/evidenceVault";
import { getDocumentPreviewUrl } from "../../services/documentService";
import {
  getDepositDisputePackDetails,
  getInspectionReportDetails,
  listInspectionReports,
  recordDepositDisputePackExport,
} from "../../services/legalSecurityService";

function getReferencedReportIds(pack) {
  const ids = new Set();
  for (const item of pack?.deposit_dispute_pack_items || []) {
    const type = item.evidence_reference_type || item.item_type;
    if (item.evidence_reference_id && ["check_in_report", "check_out_report", "inspection_report"].includes(type)) {
      ids.add(item.evidence_reference_id);
    }
  }
  return [...ids];
}

function findReferencedReport(pack, reports, itemType, inspectionType) {
  const referencedId = (pack?.deposit_dispute_pack_items || []).find((item) =>
    item.evidence_reference_id && (item.item_type === itemType || item.evidence_reference_type === itemType)
  )?.evidence_reference_id;
  return reports.find((report) => report.id === referencedId) || reports.find((report) => report.inspection_type === inspectionType) || null;
}

function collectReportPhotos(reports) {
  return reports.flatMap((report) =>
    sortBySortOrder(report.inspection_rooms || []).flatMap((room) =>
      sortBySortOrder(room.inspection_evidence_items || []).flatMap((item) =>
        (item.inspection_photos || []).map((photo) => ({
          ...photo,
          report,
          roomName: room.room_name,
          itemLabel: item.item_label,
        }))
      )
    )
  );
}

function DisputePackPhoto({ photo, accountId }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!photo?.document_id) return () => { cancelled = true; };
    getDocumentPreviewUrl({
      documentId: photo.document_id,
      accountId,
      propertyId: photo.report?.property_id || null,
      tenantId: photo.report?.tenant_id || null,
      scope: photo.report?.tenant_id ? "shared" : "property",
      visibility: photo.report?.tenant_id ? "tenant" : "staff",
    })
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accountId, photo?.document_id, photo.report?.property_id, photo.report?.tenant_id]);

  return (
    <figure className="break-inside-avoid overflow-hidden rounded-lg border border-slate-300">
      {url ? (
        <img src={url} alt={photo.caption || `${photo.roomName} ${photo.itemLabel}`} className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center bg-slate-100 text-xs text-slate-500">Photo preview unavailable</div>
      )}
      <figcaption className="space-y-1 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-900">{photo.roomName} · {photo.itemLabel}</p>
        <p>{photo.caption || "No caption recorded"}</p>
        <p>{photo.captured_at ? new Date(photo.captured_at).toLocaleString() : "Timestamp not recorded"}</p>
      </figcaption>
    </figure>
  );
}

export default function DepositDisputePackPrintPage({ properties = [], tenants = [] }) {
  const { packId } = useParams();
  const { activeAccountId } = useAccount();
  const [pack, setPack] = useState(null);
  const [reports, setReports] = useState([]);
  const [referencedReports, setReferencedReports] = useState([]);
  const [error, setError] = useState("");
  const [recordingExport, setRecordingExport] = useState(false);

  const propertyById = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAccountId || !packId) return () => { cancelled = true; };

    async function loadPack() {
      try {
        const nextPack = await getDepositDisputePackDetails(activeAccountId, packId);
        if (cancelled) return;
        const nextReports = nextPack?.property_id
          ? await listInspectionReports(activeAccountId, { propertyId: nextPack.property_id })
          : [];
        if (cancelled) return;
        const nextReferencedReports = await Promise.all(
          getReferencedReportIds(nextPack).map((reportId) =>
            getInspectionReportDetails(activeAccountId, reportId).catch(() => null)
          )
        );
        if (cancelled) return;
        setPack(nextPack);
        setReports(nextReports);
        setReferencedReports(nextReferencedReports.filter(Boolean));
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load dispute pack.");
      }
    }

    loadPack();
    return () => { cancelled = true; };
  }, [activeAccountId, packId]);

  useEffect(() => {
    document.body.classList.add("evidence-vault-print-mode");
    return () => document.body.classList.remove("evidence-vault-print-mode");
  }, []);

  const items = pack?.deposit_dispute_pack_items || [];
  const deductionItems = items.filter((item) => item.item_type === "deduction");
  const evidenceIndex = buildEvidenceIndex(items);
  const timeline = buildDisputeTimeline(pack || {}, reports);
  const property = propertyById[pack?.property_id];
  const tenant = tenantById[pack?.tenant_id];
  const checkInReport = findReferencedReport(pack, referencedReports, "check_in_report", "check_in");
  const checkOutReport = findReferencedReport(pack, referencedReports, "check_out_report", "check_out");
  const comparisonRows = checkInReport && checkOutReport ? compareInspectionReports(checkInReport, checkOutReport) : [];
  const reportPhotos = collectReportPhotos(referencedReports);
  const signatures = referencedReports.flatMap((report) =>
    (report.inspection_signatures || []).map((signature) => ({ ...signature, report }))
  );
  const tenantResponses = referencedReports.flatMap((report) =>
    (report.inspection_report_shares || []).flatMap((share) =>
      (share.inspection_report_tenant_comments || []).map((comment) => ({ ...comment, share, report }))
    )
  );

  function handlePrint() {
    window.print();
    if (!activeAccountId || !packId) return;
    setRecordingExport(true);
    recordDepositDisputePackExport(activeAccountId, packId, { metadata: { source: "browser_print" } })
      .catch(() => {
        // Printing should remain available even if audit/export recording is unavailable.
      })
      .finally(() => setRecordingExport(false));
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-950 print:bg-white print:p-0">
      <style>{`
        .dispute-pack-document {
          color: #0f172a;
          background: white;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body { background: white !important; overflow: visible !important; }
          body.evidence-vault-print-mode aside,
          body.evidence-vault-print-mode header,
          body.evidence-vault-print-mode nav,
          .no-print { display: none !important; }
          .dispute-pack-document {
            box-shadow: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            width: 100% !important;
            padding: 0 !important;
          }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="mx-auto max-w-5xl">
        <div className="no-print mb-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
          <Link to={pack ? `/documents/evidence-vault/dispute-packs/${pack.id}` : "/documents/evidence-vault/dispute-packs"} className="text-sm font-medium text-blue-700">Back to pack</Link>
          <button type="button" onClick={handlePrint} disabled={recordingExport} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Print / save PDF
          </button>
        </div>

        {error ? <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {!pack && !error ? <p className="text-sm text-slate-500">Loading dispute pack...</p> : null}

        {pack ? (
          <article className="dispute-pack-document min-h-[297mm] rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
            <section className="border-b-4 border-slate-950 pb-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tenaqo Evidence Vault</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight">Deposit Dispute Pack</h1>
              <p className="mt-2 text-lg font-semibold">{pack.title}</p>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                This pack is an organisational evidence record created in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice.
              </p>
            </section>

            <section className="print-section mt-6 grid gap-4 border-b border-slate-300 pb-6 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Property</p>
                <p className="mt-1 font-semibold">{property?.address || property?.name || "Property not loaded"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tenant</p>
                <p className="mt-1 font-semibold">{tenant?.name || tenant?.email || "No tenant linked"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Deposit amount</p>
                <p className="mt-1 font-semibold">{formatDisputePackMoney(pack.deposit_amount)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Proposed deduction</p>
                <p className="mt-1 font-semibold">{formatDisputePackMoney(pack.proposed_deduction_amount)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Deduction schedule total</p>
                <p className="mt-1 font-semibold">{formatDisputePackMoney(calculateDeductionTotal(items))}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pack created</p>
                <p className="mt-1 font-semibold">{pack.created_at ? new Date(pack.created_at).toLocaleString() : "Not recorded"}</p>
              </div>
            </section>

            {pack.summary ? (
              <section className="print-section mt-6">
                <h2 className="text-lg font-bold">Summary</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{pack.summary}</p>
              </section>
            ) : null}

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Timeline</h2>
              <div className="mt-3 space-y-2">
                {timeline.length === 0 ? <p className="text-sm text-slate-600">No timeline events recorded.</p> : null}
                {timeline.map((event, index) => (
                  <div key={`${event.type}-${event.date}-${index}`} className="flex gap-4 border-t border-slate-200 pt-2 text-sm">
                    <span className="w-32 shrink-0 font-semibold">{event.date ? new Date(event.date).toLocaleDateString() : "No date"}</span>
                    <span className="capitalize text-slate-700">{event.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Deduction schedule</h2>
              <div className="mt-3 space-y-4">
                {deductionItems.length === 0 ? <p className="text-sm text-slate-600">No deduction items added.</p> : null}
                {deductionItems.map((item) => (
                  <div key={item.id} className="break-inside-avoid rounded-lg border border-slate-300 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-bold">{item.title}</h3>
                      <span className="font-semibold">{formatDisputePackMoney(item.claimed_amount)}</span>
                    </div>
                    {item.description ? <p className="mt-2 text-sm leading-6 text-slate-700">{item.description}</p> : null}
                    {item.evidence_reference_type ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence: {item.evidence_reference_type.replace(/_/g, " ")}</p> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Evidence index</h2>
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Evidence type</th>
                    <th className="py-2 pr-2">Title</th>
                    <th className="py-2 pr-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceIndex.length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-slate-600">No evidence references added.</td></tr>
                  ) : null}
                  {evidenceIndex.map((entry) => (
                    <tr key={entry.number} className="border-b border-slate-200">
                      <td className="py-2 pr-2 font-semibold">{entry.number}</td>
                      <td className="py-2 pr-2">{entry.typeLabel || String(entry.type).replace(/_/g, " ")}</td>
                      <td className="py-2 pr-2">{entry.title}</td>
                      <td className="py-2 pr-2">{entry.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Check-in / check-out comparison</h2>
              {comparisonRows.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  Add check-in and check-out inspection report references to include a room-by-room comparison.
                </p>
              ) : (
                <table className="mt-3 w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="py-2 pr-2">Room</th>
                      <th className="py-2 pr-2">Item</th>
                      <th className="py-2 pr-2">Check-in</th>
                      <th className="py-2 pr-2">Check-out</th>
                      <th className="py-2 pr-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={`${row.roomName}-${row.itemLabel}`} className="border-b border-slate-200 align-top">
                        <td className="py-2 pr-2 font-semibold">{row.roomName}</td>
                        <td className="py-2 pr-2">{row.itemLabel}</td>
                        <td className="py-2 pr-2">{row.checkInCondition ? getConditionRatingLabel(row.checkInCondition) : "Not recorded"}</td>
                        <td className="py-2 pr-2">{row.checkOutCondition ? getConditionRatingLabel(row.checkOutCondition) : "Not recorded"}</td>
                        <td className="py-2 pr-2">
                          {[row.checkInNotes && `In: ${row.checkInNotes}`, row.checkOutNotes && `Out: ${row.checkOutNotes}`]
                            .filter(Boolean)
                            .join(" · ") || "No notes"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Signatures and tenant response</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {signatures.length === 0 ? <p className="text-sm text-slate-600">No inspection signatures recorded.</p> : null}
                {signatures.map((signature) => (
                  <div key={signature.id} className="rounded-lg border border-slate-300 p-3 text-sm">
                    <p className="font-semibold">{signature.signer_name}</p>
                    <p className="capitalize text-slate-600">
                      {signature.signer_role || signature.signer_type} · {signature.signed_from === "tenant_portal" ? "Tenant portal" : "Landlord portal"}
                    </p>
                    <p className="text-slate-600">{signature.signed_at ? new Date(signature.signed_at).toLocaleString() : "Signed timestamp not recorded"}</p>
                    <p className="text-xs text-slate-500">{signature.report?.title || formatInspectionType(signature.report?.inspection_type)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {tenantResponses.length === 0 ? <p className="text-sm text-slate-600">No tenant comments or disputes recorded.</p> : null}
                {tenantResponses.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-slate-300 p-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{String(comment.comment_type || "comment").replace(/_/g, " ")}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{comment.comment}</p>
                    <p className="mt-2 text-xs text-slate-500">{comment.created_at ? new Date(comment.created_at).toLocaleString() : "Timestamp not recorded"}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Photos</h2>
              {reportPhotos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No referenced inspection photos found for this pack.</p>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {reportPhotos.map((photo) => (
                    <DisputePackPhoto key={photo.id} photo={photo} accountId={activeAccountId} />
                  ))}
                </div>
              )}
            </section>

            <section className="print-section mt-6">
              <h2 className="text-lg font-bold">Supporting documents and inspection reports</h2>
              <p className="mt-2 text-sm text-slate-700">
                Include tenancy agreements, deposit protection documents, invoices, quotes, receipts, signed inspection reports, tenant comments and photo evidence where relevant.
              </p>
            </section>

            <footer className="mt-8 border-t border-slate-300 pt-4 text-xs leading-5 text-slate-600">
              This pack is an organisational evidence record created in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice.
            </footer>
          </article>
        ) : null}
      </div>
    </main>
  );
}
