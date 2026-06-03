import {
  buildDiagnosticKeyAnswers,
  calculateDiagnosticOutcome,
  formatDiagnosticSummary,
} from "../lib/maintenanceDiagnostics";
import { supabase } from "../lib/supabase";

function isMissingBackendObject(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("does not exist") || message.includes("schema cache");
}

function sortSteps(steps) {
  return [...(steps || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

let diagnosticTemplateCache = null;

export async function listMaintenanceDiagnosticTemplates() {
  if (diagnosticTemplateCache) return diagnosticTemplateCache;

  const { data, error } = await supabase
    .from("maintenance_diagnostic_templates")
    .select(
      "id, issue_type, title, description, emergency_warning, active, maintenance_diagnostic_steps(id, template_id, step_key, question, answer_type, options, help_text, sort_order, triggers_emergency, triggers_deposit_flag, triggers_eco_upgrade_flag, triggers_compliance_flag, active)",
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }

  diagnosticTemplateCache = (data || []).map((template) => ({
    ...template,
    maintenance_diagnostic_steps: sortSteps(
      (template.maintenance_diagnostic_steps || []).filter((step) => step.active !== false),
    ),
  }));
  return diagnosticTemplateCache;
}

export async function getMaintenanceDiagnosticTemplate(issueType) {
  if (!issueType) return null;
  const templates = await listMaintenanceDiagnosticTemplates();
  return templates.find((template) => template.issue_type === issueType) || null;
}

export async function writeMaintenanceDiagnosticAuditEvent({
  accountId,
  sessionId,
  maintenanceRequestId = null,
  eventType,
  metadata = {},
} = {}) {
  if (!accountId || !sessionId || !eventType) return null;
  const { data, error } = await supabase
    .from("maintenance_diagnostic_audit_events")
    .insert({
      account_id: accountId,
      session_id: sessionId,
      maintenance_request_id: maintenanceRequestId,
      event_type: eventType,
      metadata,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("Maintenance diagnostic audit event skipped", error);
    return null;
  }
  return data;
}

export async function createMaintenanceDiagnosticForRequest({
  accountId,
  propertyId,
  tenantId = null,
  maintenanceRequestId,
  issueType,
  template,
  answers = {},
} = {}) {
  if (!accountId || !propertyId || !maintenanceRequestId || !issueType || !template?.id) {
    return null;
  }

  const steps = sortSteps(template.maintenance_diagnostic_steps || []);
  const outcome = calculateDiagnosticOutcome({ issueType, steps, answers });
  const summary = formatDiagnosticSummary({ issueType, steps, answers, outcome });
  const keyAnswers = buildDiagnosticKeyAnswers({ steps, answers });

  const { data: session, error: sessionError } = await supabase
    .from("maintenance_diagnostic_sessions")
    .insert({
      account_id: accountId,
      property_id: propertyId,
      tenant_id: tenantId,
      maintenance_request_id: maintenanceRequestId,
      template_id: template.id,
      issue_type: issueType,
      urgency: outcome.urgency,
      outcome_category: outcome.outcomeCategory,
      recommended_next_step: outcome.recommendedNextStep,
      emergency_flag: outcome.emergencyFlag,
      deposit_relevant: outcome.depositRelevant,
      eco_upgrade_relevant: outcome.ecoUpgradeRelevant,
      compliance_relevant: outcome.complianceRelevant,
      summary,
      completed_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session?.id) return null;

  const answerRows = steps
    .map((step) => {
      const answer = answers[step.step_key];
      if (!answer) return null;
      const keyAnswer = keyAnswers.find((entry) => entry.stepKey === step.step_key);
      return {
        account_id: accountId,
        session_id: session.id,
        step_id: step.id,
        answer,
        answer_label: keyAnswer?.answer || null,
      };
    })
    .filter(Boolean);

  if (answerRows.length > 0) {
    const { error: answersError } = await supabase.from("maintenance_diagnostic_answers").insert(answerRows);
    if (answersError) {
      await supabase.from("maintenance_diagnostic_sessions").delete().eq("id", session.id).eq("account_id", accountId);
      throw answersError;
    }
  }

  await writeMaintenanceDiagnosticAuditEvent({
    accountId,
    sessionId: session.id,
    maintenanceRequestId,
    eventType: "session_started",
    metadata: { issueType },
  });

  const { error: linkError } = await supabase.from("maintenance_diagnostic_links").insert({
    account_id: accountId,
    session_id: session.id,
    maintenance_request_id: maintenanceRequestId,
    link_type: "maintenance_request",
    linked_object_id: maintenanceRequestId,
    note: "Diagnostic session attached to maintenance request for landlord review.",
  });
  if (linkError && !isMissingBackendObject(linkError)) {
    console.warn("Maintenance diagnostic link skipped", linkError);
  } else if (!linkError) {
    await writeMaintenanceDiagnosticAuditEvent({
      accountId,
      sessionId: session.id,
      maintenanceRequestId,
      eventType: "session_linked",
      metadata: { linkType: "maintenance_request", linkedObjectId: maintenanceRequestId },
    });
  }

  const flagEvents = [
    outcome.depositRelevant && "deposit_evidence_flagged",
    outcome.ecoUpgradeRelevant && "eco_upgrade_flagged",
    outcome.complianceRelevant && "compliance_review_flagged",
  ].filter(Boolean);
  await Promise.all(
    flagEvents.map((eventType) =>
      writeMaintenanceDiagnosticAuditEvent({
        accountId,
        sessionId: session.id,
        maintenanceRequestId,
        eventType,
        metadata: { issueType, outcomeCategory: outcome.outcomeCategory },
      }),
    ),
  );

  await writeMaintenanceDiagnosticAuditEvent({
    accountId,
    sessionId: session.id,
    maintenanceRequestId,
    eventType: "session_completed",
    metadata: { issueType, outcome },
  });

  return { ...session, key_answers: keyAnswers };
}

export async function listDiagnosticsForMaintenanceRequests({ accountId, requestIds = [] } = {}) {
  const ids = requestIds.filter(Boolean);
  if (!accountId || ids.length === 0) return {};

  const { data, error } = await supabase
    .from("maintenance_diagnostic_sessions")
    .select(
      "id, account_id, property_id, tenant_id, maintenance_request_id, issue_type, urgency, outcome_category, recommended_next_step, emergency_flag, deposit_relevant, eco_upgrade_relevant, compliance_relevant, summary, created_at, completed_at, maintenance_diagnostic_answers(id, answer, answer_label, maintenance_diagnostic_steps(step_key, question, sort_order))",
    )
    .eq("account_id", accountId)
    .in("maintenance_request_id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingBackendObject(error)) return {};
    throw error;
  }

  const grouped = {};
  for (const session of data || []) {
    const key = session.maintenance_request_id;
    if (!key || grouped[key]) continue;
    grouped[key] = {
      ...session,
      key_answers: (session.maintenance_diagnostic_answers || [])
        .map((answer) => ({
          stepKey: answer.maintenance_diagnostic_steps?.step_key || "",
          question: answer.maintenance_diagnostic_steps?.question || "",
          answer: answer.answer_label || answer.answer?.value || "",
          sortOrder: Number(answer.maintenance_diagnostic_steps?.sort_order || 0),
        }))
        .filter((answer) => answer.question || answer.answer)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 6),
    };
  }
  return grouped;
}
