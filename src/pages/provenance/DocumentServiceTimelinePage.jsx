import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Upload, Send, CheckCircle, XCircle, Eye, Download,
  ThumbsUp, Clock, RefreshCw, Ban, ShieldCheck, ShieldAlert,
} from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import { getDocumentServiceTimeline } from "../../services/provenanceDocumentService";
import { useI18n } from "../../context/I18nContext";

const EVENT_CONFIG = {
  "document.uploaded":           { label: "Uploaded",            icon: Upload,      color: "text-slate-700" },
  "document.served_asserted":    { label: "Service Asserted",    icon: Send,        color: "text-indigo-700" },
  "document.served_system":      { label: "Service Sent",        icon: Send,        color: "text-blue-700" },
  "document.delivery_confirmed": { label: "Delivery Confirmed",  icon: CheckCircle, color: "text-emerald-700" },
  "document.service_failed":     { label: "Service Failed",      icon: XCircle,     color: "text-rose-700" },
  "document.available":          { label: "Available",            icon: Eye,         color: "text-blue-600" },
  "document.viewed":             { label: "Viewed",              icon: Eye,         color: "text-emerald-600" },
  "document.downloaded":         { label: "Downloaded",          icon: Download,    color: "text-emerald-700" },
  "document.acknowledged":       { label: "Acknowledged",        icon: ThumbsUp,    color: "text-emerald-800" },
  "document.expired":            { label: "Expired",             icon: Clock,       color: "text-amber-700" },
  "document.replaced":           { label: "Replaced",            icon: RefreshCw,   color: "text-amber-600" },
  "document.withdrawn":          { label: "Withdrawn",           icon: Ban,         color: "text-rose-600" },
};

const STRENGTH_LABELS = [
  "No evidence",
  "Uploaded",
  "Service recorded",
  "Viewed / Downloaded",
  "Acknowledged",
];

function StrengthMeter({ level }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-3 w-5 rounded-sm ${
              i <= level ? "bg-emerald-500" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-slate-700">
        {STRENGTH_LABELS[level] || STRENGTH_LABELS[0]}
      </span>
    </div>
  );
}

function TimelineEvent({ event }) {
  const config = EVENT_CONFIG[event.event_type] || {
    label: event.event_type,
    icon: Clock,
    color: "text-slate-600",
  };
  const Icon = config.icon;

  return (
    <div className="flex gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`mt-0.5 shrink-0 ${config.color}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.color}`}>
          {config.label}
          {event.is_manual_assertion && (
            <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-indigo-700">
              assertion
            </span>
          )}
          {event.is_reconstructed && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
              reconstructed
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {event.safe_metadata_summary}
        </p>
        <div className="flex gap-4 mt-1 text-xs text-slate-400">
          <span>
            Effective: {event.effective_at ? new Date(event.effective_at).toLocaleString() : "—"}
          </span>
          <span>
            Recorded: {event.recorded_at ? new Date(event.recorded_at).toLocaleString() : "—"}
          </span>
        </div>
        <div className="flex gap-4 mt-0.5 text-xs text-slate-400">
          {event.actor_type && <span>Actor: {event.actor_type}</span>}
          {event.actor_role && <span>Role: {event.actor_role}</span>}
          {event.source_type && <span>Source: {event.source_type}</span>}
        </div>
      </div>
    </div>
  );
}

export default function DocumentServiceTimelinePage() {
  const { documentId } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getDocumentServiceTimeline(documentId);
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <p className="font-medium text-rose-800">Could not load document timeline</p>
          <p className="mt-1 text-sm text-rose-600">{error}</p>
        </div>
      </div>
    );
  }

  const events = data.events || [];
  const version = data.document_version || {};

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          to=".."
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900" data-testid="timeline-title">
          Service &amp; Access Timeline
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {version.filename || "Document"} — v{version.version_number || 1}
        </p>
      </div>

      {/* Status + Access Evidence Strength */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4" data-testid="projection-status">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Status</p>
          <p className="text-sm font-semibold text-slate-800">
            {(data.status || "unknown").replace(/_/g, " ")}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4" data-testid="evidence-strength">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Access Evidence Strength
          </p>
          <StrengthMeter level={data.access_evidence_strength || 0} />
        </div>
      </div>

      {/* Ledger integrity + Anchor */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4" data-testid="ledger-integrity">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Ledger integrity
          </p>
          <p className={`flex items-center gap-1.5 text-sm font-semibold ${
            data.ledger_integrity_status === "passed" ? "text-emerald-700" :
            data.ledger_integrity_status === "failed" ? "text-rose-700" :
            data.ledger_integrity_status === "stale" ? "text-amber-700" :
            "text-slate-600"
          }`}>
            {data.ledger_integrity_status === "passed"
              ? <><ShieldCheck size={15} /> Passed</>
              : data.ledger_integrity_status === "failed"
              ? <><ShieldAlert size={15} /> Failed</>
              : data.ledger_integrity_status === "stale"
              ? <><Clock size={15} /> Verification out of date</>
              : <><Clock size={15} /> Unverified</>
            }
          </p>
          {data.verified_at && (
            <p className="text-xs text-slate-400 mt-1">
              Verified: {new Date(data.verified_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 p-4" data-testid="anchor-summary">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Anchor
          </p>
          {data.anchor_summary?.has_anchor ? (
            <p className="text-sm font-semibold text-slate-800">
              {data.anchor_summary.anchor_consistent ? "Consistent" : "Inconsistent"}
            </p>
          ) : (
            <p className="text-sm text-slate-600">Not yet anchored</p>
          )}
        </div>
      </div>

      {/* Event timeline */}
      <div data-testid="event-timeline">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">
          Events ({events.length})
        </p>
        {events.length > 0 ? (
          <div className="rounded-lg border border-slate-200 p-4">
            {events.map((ev, i) => (
              <TimelineEvent key={ev.event_id || i} event={ev} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">No events recorded yet.</p>
        )}
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-slate-400" data-testid="access-evidence-disclaimer">
        {data.access_evidence_disclaimer || data.safe_user_message}
      </div>
    </div>
  );
}
