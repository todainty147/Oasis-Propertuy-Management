import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Hash,
  Info,
  Shield,
  XCircle,
} from "lucide-react";

function formatTimestamp(val) {
  if (!val) return "Not recorded";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString();
}

function StatusIndicator({ present, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {present ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      )}
      <span className={present
        ? "text-slate-800 dark:text-slate-200"
        : "text-slate-500 dark:text-slate-400"
      }>
        {label}
      </span>
    </div>
  );
}

function ProvenanceEvent({ event }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
      <span className="mt-0.5 shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        {event.sequence_number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-800 dark:text-slate-200">{event.event_type}</div>
        <div className="mt-0.5 text-slate-500 dark:text-slate-400">
          {event.entity_type} · {formatTimestamp(event.recorded_at)}
        </div>
        {event.summary && (
          <div className="mt-1 text-slate-600 dark:text-slate-300">{event.summary}</div>
        )}
      </div>
    </div>
  );
}

export default function ObligationProofPackPanel({ payload }) {
  const [provenanceExpanded, setProvenanceExpanded] = useState(false);

  if (!payload) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
        <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No proof pack loaded
        </p>
      </div>
    );
  }

  const { evaluation, obligation, evidence, basis_review, provenance, status } = payload;
  const evidenceItems = Array.isArray(evidence) ? evidence : [];
  const provenanceItems = Array.isArray(provenance) ? provenance : [];
  const traceStatus = status?.provenance_trace_status;
  const missingEvents = traceStatus?.missing_event_types ?? [];

  return (
    <div className="space-y-4" data-testid="proof-pack-panel">
      <div
        className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-600 dark:bg-amber-900/30"
        role="status"
        aria-live="polite"
        data-testid="proof-pack-demo-watermark"
      >
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              {status?.pack_status_label || "Demo proof pack — not legal sign-off"}
            </p>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200">
              This view shows recorded evidence state only. It is not a legal verdict.
            </p>
          </div>
        </div>
      </div>

      <h2
        className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        data-testid="proof-pack-headline"
      >
        Evidence state summary
      </h2>


      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <StatusIndicator present={status?.evaluation_recorded} label="Evaluation recorded" />
        <StatusIndicator present={status?.obligation_created} label="Obligation created" />
        <StatusIndicator
          present={status?.discharge_evidence_present}
          label={status?.discharge_evidence_present
            ? "Discharge evidence recorded"
            : "Discharge evidence: not recorded"}
        />
        <StatusIndicator present={status?.provenance_trail_intact} label="Provenance trail present" />
        {status?.basis_review_required && (
          <StatusIndicator present label="Basis review recommended" />
        )}
      </div>

      {/* Obligation */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Obligation</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Kind</dt>
            <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
              {obligation?.obligation_kind ?? "Not recorded"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Posture</dt>
            <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
              {obligation?.posture ?? "Not recorded"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Exposure ceiling</dt>
            <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
              {obligation?.exposure_gbp_ceiling != null
                ? `£${Number(obligation.exposure_gbp_ceiling).toLocaleString()}`
                : "Not recorded"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <dt className="text-slate-500 dark:text-slate-400">Created</dt>
            <dd className="mt-1 text-slate-800 dark:text-slate-200">
              {formatTimestamp(obligation?.created_at)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Evaluation */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Evaluation</h3>
        {evaluation ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <dt className="text-slate-500 dark:text-slate-400">Result</dt>
              <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {evaluation.result}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <dt className="text-slate-500 dark:text-slate-400">Confidence</dt>
              <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {evaluation.confidence ?? "Not recorded"}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <dt className="text-slate-500 dark:text-slate-400">Evaluated at</dt>
              <dd className="mt-1 text-slate-800 dark:text-slate-200">
                {formatTimestamp(evaluation.evaluated_at)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
              <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Hash className="h-3 w-3" />
                Input snapshot hash
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200">
                {evaluation.input_snapshot_hash ?? "Not recorded"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Evaluation: not recorded
          </p>
        )}
      </section>

      {/* Evidence */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Evidence</h3>
        {evidenceItems.length > 0 ? (
          <div className="mt-3 space-y-2">
            {evidenceItems.map((item, idx) => (
              <div
                key={item.evidence_id || idx}
                className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"
              >
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Identity</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                      {item.official_info_sheet_identity ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Type</dt>
                    <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                      {item.evidence_type ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Service timestamp</dt>
                    <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                      {formatTimestamp(item.service_evidence_timestamp)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Captured at</dt>
                    <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                      {formatTimestamp(item.captured_at)}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Discharge evidence: not recorded
          </p>
        )}
      </section>


      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Current state</h3>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
            <span className="text-slate-500 dark:text-slate-400">Posture: </span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {obligation?.posture ?? "Not recorded"}
            </span>
          </div>
          {basis_review?.review_required && (
            <div
              className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800/40 dark:bg-blue-900/20"
              data-testid="proof-pack-basis-review-flag"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  Review recommended
                </p>
                <p className="mt-0.5 text-blue-700 dark:text-blue-300">
                  Discharged. Basis changed after discharge — review recommended.
                </p>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-blue-600 dark:text-blue-400">Change kind</dt>
                    <dd className="text-blue-800 dark:text-blue-200">
                      {basis_review.basis_change_kind ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-blue-600 dark:text-blue-400">Flagged at</dt>
                    <dd className="text-blue-800 dark:text-blue-200">
                      {formatTimestamp(basis_review.review_flagged_at)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
      </section>


      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Provenance</h3>

        <div className="mt-3 space-y-2" data-testid="proof-pack-trace-status">
          <div className="flex items-center gap-2 text-sm">
            {traceStatus?.expected_events_present ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Provenance trail: complete
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Provenance trail: incomplete
                </span>
              </>
            )}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Expected events present: {traceStatus?.expected_events_present ? "yes" : "no"}
          </div>
          {missingEvents.length > 0 && (
            <div className="text-sm">
              <span className="text-slate-500 dark:text-slate-400">Missing event types: </span>
              <span className="font-mono text-xs text-amber-700 dark:text-amber-300">
                {missingEvents.join(", ")}
              </span>
            </div>
          )}
        </div>

        {provenanceItems.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setProvenanceExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              aria-expanded={provenanceExpanded}
              data-testid="proof-pack-provenance-toggle"
            >
              {provenanceExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Ordered provenance trail ({provenanceItems.length} events)
            </button>
            {provenanceExpanded && (
              <div className="mt-2 space-y-1.5" data-testid="proof-pack-provenance-trail">
                {provenanceItems.map((event, idx) => (
                  <ProvenanceEvent key={event.event_id || idx} event={event} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
