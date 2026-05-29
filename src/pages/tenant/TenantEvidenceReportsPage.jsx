import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, FileText, MessageSquare, ShieldCheck } from "lucide-react";

import Card from "../../components/Card";
import Skeleton from "../../components/ui/Skeleton";
import DashboardBreadcrumbs from "../../components/DashboardBreadcrumbs";
import { useAccount } from "../../context/AccountContext";
import { usePageTitle } from "../../layout/PageTitleContext";
import {
  calculateInspectionReportCounts,
  formatInspectionType,
  getConditionRatingLabel,
  sortBySortOrder,
} from "../../lib/evidenceVault";
import { getDocumentPreviewUrl } from "../../services/documentService";
import {
  addTenantInspectionReportComment,
  getTenantInspectionReportShare,
  listTenantInspectionReportShares,
  markTenantInspectionReportViewed,
  recordTenantInspectionSignature,
} from "../../services/legalSecurityService";

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function TenantEvidencePhoto({ photo, accountId, report }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!photo?.document_id) return () => { cancelled = true; };
    getDocumentPreviewUrl({
      documentId: photo.document_id,
      accountId,
      propertyId: report?.property_id || null,
      tenantId: report?.tenant_id || null,
      scope: "shared",
      visibility: "tenant",
    })
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accountId, photo?.document_id, report?.property_id, report?.tenant_id]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)]">
      {url ? (
        <img src={url} alt={photo.caption || "Inspection evidence"} className="h-28 w-full object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center text-xs text-[var(--text-muted)]">Photo preview unavailable</div>
      )}
      <p className="truncate px-3 py-2 text-xs text-[var(--text-muted)]">{photo.caption || "Evidence photo"}</p>
    </div>
  );
}

function ShareStatus({ status }) {
  const label = {
    shared: "Ready for review",
    viewed: "Viewed",
    tenant_signed: "Signed",
    tenant_disputed: "Disputed",
    revoked: "Revoked",
    expired: "Expired",
  }[status] || "Ready for review";
  return <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">{label}</span>;
}

export default function TenantEvidenceReportsPage({ properties = [] }) {
  const { activeAccountId } = useAccount();
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { setTitle } = usePageTitle();
  const [shares, setShares] = useState([]);
  const [selectedShare, setSelectedShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [commentForm, setCommentForm] = useState({ comment_type: "general", comment: "", evidence_item_id: "" });
  const [signerName, setSignerName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const propertyById = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);

  useEffect(() => {
    setTitle("Evidence Reports");
  }, [setTitle]);

  useEffect(() => {
    if (!activeAccountId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextShares = await listTenantInspectionReportShares(activeAccountId);
        if (cancelled) return;
        setShares(nextShares);
        const nextSelected = shareId
          ? await getTenantInspectionReportShare(activeAccountId, shareId)
          : nextShares[0] || null;
        if (cancelled) return;
        setSelectedShare(nextSelected);
        if (nextSelected?.id && !nextSelected.viewed_at) {
          markTenantInspectionReportViewed(activeAccountId, nextSelected.id).catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load shared evidence reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeAccountId, shareId]);

  async function reloadSelected() {
    if (!activeAccountId || !selectedShare?.id) return;
    const [nextShares, nextSelected] = await Promise.all([
      listTenantInspectionReportShares(activeAccountId),
      getTenantInspectionReportShare(activeAccountId, selectedShare.id),
    ]);
    setShares(nextShares);
    setSelectedShare(nextSelected);
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();
    if (!selectedShare) return;
    setActionLoading(true);
    setError("");
    setMessage("");
    try {
      await addTenantInspectionReportComment(activeAccountId, selectedShare.id, commentForm);
      setCommentForm({ comment_type: "general", comment: "", evidence_item_id: "" });
      await reloadSelected();
      setMessage("Your response has been recorded.");
    } catch (err) {
      setError(err?.message || "Could not save your response.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSign(event) {
    event.preventDefault();
    if (!selectedShare) return;
    setActionLoading(true);
    setError("");
    setMessage("");
    try {
      await recordTenantInspectionSignature(activeAccountId, selectedShare.id, { signerName });
      setSignerName("");
      await reloadSelected();
      setMessage("Your review signature has been recorded.");
    } catch (err) {
      setError(err?.message || "Could not record your signature.");
    } finally {
      setActionLoading(false);
    }
  }

  const report = selectedShare?.inspection_reports;
  const counts = calculateInspectionReportCounts(report || {});
  const property = propertyById[report?.property_id];
  const comments = selectedShare?.inspection_report_tenant_comments || [];
  const tenantSignature = (report?.inspection_signatures || []).find((signature) => signature.signer_role === "tenant" && signature.share_id === selectedShare?.id);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DashboardBreadcrumbs items={[{ label: "Evidence Reports" }]} />
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Evidence Reports</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Review shared inspection reports, add comments and sign from your tenant portal.</p>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-950/40 dark:text-rose-100">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-100">{message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="p-4">
          <h3 className="font-semibold text-[var(--text-primary)]">Shared reports</h3>
          <div className="mt-3 space-y-2">
            {shares.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No evidence reports have been shared with you yet.</p> : null}
            {shares.map((share) => {
              const shareReport = share.inspection_reports;
              return (
                <button
                  key={share.id}
                  type="button"
                  onClick={() => navigate(`/tenant/evidence-reports/${share.id}`)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    selectedShare?.id === share.id
                      ? "border-blue-400 bg-blue-50 text-slate-950 dark:bg-blue-500/10 dark:text-white"
                      : "border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{shareReport?.title || "Inspection report"}</p>
                    <ShareStatus status={share.share_status} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{formatInspectionType(shareReport?.inspection_type)} · {shareReport?.inspection_date}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {!report ? (
          <Card className="p-5">
            <p className="text-sm text-[var(--text-muted)]">Choose a shared report to review.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Inspection report</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{report.title}</h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{property?.address || property?.name || "Property"} · {formatInspectionType(report.inspection_type)} · {report.inspection_date}</p>
                </div>
                <ShareStatus status={selectedShare.share_status} />
              </div>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                {counts.roomCount} rooms · {counts.itemCount} checklist items · {counts.photoCount} photos
              </p>
              <p className="mt-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-secondary)]">
                Your signature confirms receipt/review of this report, not necessarily agreement with every item unless stated.
              </p>
            </Card>

            <div className="space-y-3">
              {sortBySortOrder(report.inspection_rooms || []).map((room) => (
                <Card key={room.id} className="p-4">
                  <h4 className="font-semibold text-[var(--text-primary)]">{room.room_name}</h4>
                  <div className="mt-3 space-y-3">
                    {sortBySortOrder(room.inspection_evidence_items || []).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium text-[var(--text-primary)]">{item.item_label}</p>
                            {item.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{item.notes}</p> : null}
                          </div>
                          <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-[var(--text-secondary)]">{getConditionRatingLabel(item.condition_rating)}</span>
                        </div>
                        {(item.inspection_photos || []).length > 0 ? (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {item.inspection_photos.map((photo) => (
                              <TenantEvidencePhoto key={photo.id} photo={photo} accountId={activeAccountId} report={report} />
                            ))}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setCommentForm((current) => ({ ...current, evidence_item_id: item.id, comment_type: "dispute" }))}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
                        >
                          <MessageSquare size={14} /> Comment on this item
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>

            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text-primary)]">Tenant comments</h3>
              <div className="mt-3 space-y-2">
                {comments.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No comments or disputes submitted yet.</p> : null}
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{comment.comment_type}</p>
                    <p className="mt-1 text-[var(--text-primary)]">{comment.comment}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleCommentSubmit} className="mt-4 space-y-3">
                <select
                  value={commentForm.comment_type}
                  onChange={(event) => setCommentForm((current) => ({ ...current, comment_type: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="general">General comment</option>
                  <option value="agree">Agree</option>
                  <option value="dispute">Dispute</option>
                  <option value="clarification">Needs clarification</option>
                </select>
                <textarea
                  required
                  value={commentForm.comment}
                  onChange={(event) => setCommentForm((current) => ({ ...current, comment: event.target.value }))}
                  rows={3}
                  placeholder="Add your response"
                  className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
                <button type="submit" disabled={actionLoading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  <MessageSquare size={16} /> Submit comments/disputes
                </button>
              </form>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text-primary)]">Sign report</h3>
              {tenantSignature ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-100">
                  <CheckCircle2 size={16} /> Signed by {tenantSignature.signer_name} on {formatDate(tenantSignature.signed_at)}
                </p>
              ) : (
                <form onSubmit={handleSign} className="mt-3 space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    I confirm that I have reviewed this inspection report. My signature confirms receipt/review of this report, not necessarily agreement with every item unless stated.
                  </p>
                  <input
                    required
                    value={signerName}
                    onChange={(event) => setSignerName(event.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  />
                  <button type="submit" disabled={actionLoading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    <ShieldCheck size={16} /> Sign report
                  </button>
                </form>
              )}
            </Card>
          </div>
        )}
      </div>

      <Link to="/tenant/home" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--focus-border)] hover:underline">
        <FileText size={14} /> Back to tenant home
      </Link>
    </div>
  );
}
