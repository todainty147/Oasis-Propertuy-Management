import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Hash,
  Info,
  Shield,
  XCircle,
} from "lucide-react";
import {
  defaultProofPackLabels,
  mergeProofPackLabels,
} from "./proofPackPresentation";

const LEGACY_MISSING_EVENT_TYPES_LABEL = "Missing event types:";
const LEGACY_EXPECTED_EVENTS_LABEL = "Expected events present:";

function formatTimestamp(val) {
  if (!val) return "Not recorded";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString();
}

function formatMoney(value) {
  return value != null ? `£${Number(value).toLocaleString()}` : "Not recorded";
}

function labelize(value) {
  if (!value) return "Not recorded";
  return String(value).replace(/_/g, " ");
}

function Card({ children, className = "", testId }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`mt-1 text-slate-800 dark:text-slate-200 ${mono ? "break-all font-mono text-xs" : "font-medium"}`}>
        {value ?? "Not recorded"}
      </dd>
    </div>
  );
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

function PackHeader({ labels, status }) {
  return (
    <>
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
              {status?.pack_status_label || labels.watermark || "Demo proof pack — not legal sign-off"}
            </p>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200">
              {labels.watermarkHelper || "This view shows recorded evidence state only. It is not a legal verdict."}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Proof pack
        </p>
        <h2
          className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100"
          data-testid="proof-pack-headline"
        >
          {labels.headline || "Evidence state summary"}
        </h2>
      </div>
    </>
  );
}

function ComponentStates({ labels, status }) {
  return (
    <Card testId="proof-pack-component-states">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.componentStates}
      </h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <StatusIndicator present label="Review recommended" />
        )}
      </div>
    </Card>
  );
}

function WhatThisPackCovers({ labels, obligation }) {
  return (
    <Card testId="proof-pack-what-covers">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.whatCovers}
      </h3>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        This pack brings together the recorded assessment, service evidence, current
        obligation state, and ordered proof trail for the Renters’ Rights information
        sheet obligation.
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label={labels.obligationKind} value={obligation?.obligation_kind ?? "Not recorded"} />
        <Field label={labels.posture} value={labelize(obligation?.posture)} />
        <Field label={labels.exposureCeiling} value={formatMoney(obligation?.exposure_gbp_ceiling)} />
        <Field label={labels.createdAt} value={formatTimestamp(obligation?.created_at)} />
      </dl>
    </Card>
  );
}

function Assessment({ labels, evaluation }) {
  return (
    <Card testId="proof-pack-assessment">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.assessment}
      </h3>
      {evaluation ? (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label={labels.result} value={labelize(evaluation.result)} />
          <Field label={labels.confidence} value={evaluation.confidence ?? "Not recorded"} />
          <Field label={labels.evaluatedAt} value={formatTimestamp(evaluation.evaluated_at)} />
          <Field label="Demo mode" value={evaluation.demo_mode ? "Yes" : "No"} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Evaluation: not recorded
        </p>
      )}
    </Card>
  );
}

function Evidence({ labels, evidenceItems }) {
  return (
    <Card testId="proof-pack-evidence">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.evidence}
      </h3>
      {evidenceItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {evidenceItems.map((item, idx) => (
            <div
              key={item.evidence_id || idx}
              className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"
            >
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{labels.officialIdentity}</dt>
                  <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                    {item.official_info_sheet_identity ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{labels.evidenceType}</dt>
                  <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                    {item.evidence_type ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{labels.serviceTimestamp}</dt>
                  <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                    {formatTimestamp(item.service_evidence_timestamp)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{labels.capturedAt}</dt>
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
    </Card>
  );
}

function CurrentState({ labels, obligation, basis_review }) {
  return (
    <Card testId="proof-pack-current-state">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.currentState}
      </h3>
      <div className="mt-3 space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
          <span className="text-slate-500 dark:text-slate-400">{labels.posture}: </span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {labelize(obligation?.posture)}
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
    </Card>
  );
}

function ProofTrail({ labels, provenanceItems, traceStatus, missingEvents }) {
  const [provenanceExpanded, setProvenanceExpanded] = useState(false);

  return (
    <Card testId="proof-pack-proof-trail">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.proofTrail}
      </h3>

      <div className="mt-3 space-y-2" data-testid="proof-pack-trace-status">
        <div className="flex items-center gap-2 text-sm">
          {traceStatus?.expected_events_present ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {labels.traceComplete || "Provenance trail: complete"}
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {labels.traceIncomplete || "Provenance trail: incomplete"}
              </span>
            </>
          )}
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {labels.expectedEventsPresent ? `${labels.expectedEventsPresent}:` : LEGACY_EXPECTED_EVENTS_LABEL} {traceStatus?.expected_events_present ? "yes" : "no"}
        </div>
        {missingEvents.length > 0 && (
          <div className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {labels.missingEventTypes ? `${labels.missingEventTypes}: ` : `${LEGACY_MISSING_EVENT_TYPES_LABEL} `}
            </span>
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
            {labels.orderedTrail} ({provenanceItems.length} events)
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
    </Card>
  );
}

function VerificationDetails({ labels, evaluation, obligation, provenanceItems, exportedAt }) {
  return (
    <details
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      data-testid="proof-pack-verification-details"
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100">
        {labels.verificationDetails}
      </summary>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {labels.verificationHelper}
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <Field label={labels.evidenceFingerprint} value={evaluation && evaluation.input_snapshot_hash} mono />
        <Field label={labels.assessmentReference} value={evaluation?.evaluation_id} mono />
        <Field label={labels.obligationReference} value={obligation?.obligation_instance_id} mono />
        <Field
          label={labels.proofTrailReference}
          value={provenanceItems.length
            ? provenanceItems.map((event) => event.sequence_number).join(" → ")
            : "Not recorded"}
          mono
        />
        <Field label={labels.evaluatedAt} value={formatTimestamp(evaluation?.evaluated_at)} />
        <Field label={labels.exportedAt} value={exportedAt ? formatTimestamp(exportedAt) : "Only shown in exported PDF"} />
      </dl>
    </details>
  );
}

function ExportSection({ labels, exportAction, payload }) {
  if (!exportAction) return null;
  return (
    <Card testId="proof-pack-export">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {labels.export}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The PDF keeps the same demo watermark and evidence-state wording.
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportAction(payload)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          data-testid="proof-pack-export-pdf"
        >
          <Download className="h-4 w-4" />
          {labels.exportPdf}
        </button>
      </div>
    </Card>
  );
}

export default function ObligationProofPackPanel({
  payload,
  mode = "diagnostic",
  labels: labelsProp = defaultProofPackLabels,
  showVerificationDetails = true,
  exportAction = null,
}) {
  const labels = mergeProofPackLabels(labelsProp);

  if (!payload) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
        <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {labels.noProofPack || "No proof pack loaded"}
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
    <div className="space-y-4" data-testid="proof-pack-panel" data-mode={mode}>
      <PackHeader labels={labels} status={status} />
      <ComponentStates labels={labels} status={status} />
      <WhatThisPackCovers labels={labels} obligation={obligation} />
      <Assessment labels={labels} evaluation={evaluation} />
      <Evidence labels={labels} evidenceItems={evidenceItems} />
      <CurrentState labels={labels} obligation={obligation} basis_review={basis_review} />
      <ProofTrail
        labels={labels}
        provenanceItems={provenanceItems}
        traceStatus={traceStatus}
        missingEvents={missingEvents}
      />
      {showVerificationDetails && (
        <VerificationDetails
          labels={labels}
          evaluation={evaluation}
          obligation={obligation}
          provenanceItems={provenanceItems}
        />
      )}
      <ExportSection labels={labels} exportAction={exportAction} payload={payload} />
    </div>
  );
}
