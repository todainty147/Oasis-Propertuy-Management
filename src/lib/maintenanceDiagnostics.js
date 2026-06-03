export const EMERGENCY_SAFETY_COPY =
  "These checks are for basic information gathering only. Do not attempt repairs you are not qualified to perform. If there is a gas smell, electrical danger, fire, flooding, carbon monoxide alarm, security risk, or immediate danger, contact emergency services or the relevant emergency provider immediately.";

export const MAINTENANCE_DIAGNOSTIC_ISSUES = [
  { value: "boiler_heating", label: "Boiler / heating" },
  { value: "no_hot_water", label: "No hot water" },
  { value: "damp_mould", label: "Damp or mould" },
  { value: "electrical_issue", label: "Electrical issue" },
  { value: "leak", label: "Leak" },
  { value: "blocked_drain", label: "Blocked drain" },
  { value: "appliance_issue", label: "Appliance issue" },
  { value: "pest_issue", label: "Pest issue" },
  { value: "lost_keys_security", label: "Lost keys / security" },
  { value: "door_window_lock", label: "Door, window, or lock" },
  { value: "other", label: "Other" },
];

const AFFIRMATIVE_VALUES = new Set(["yes", "true", "1", "y"]);

export function getDiagnosticIssueLabel(issueType) {
  return MAINTENANCE_DIAGNOSTIC_ISSUES.find((issue) => issue.value === issueType)?.label || "Maintenance issue";
}

export function isAffirmativeAnswer(value) {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(isAffirmativeAnswer);
  if (value && typeof value === "object") {
    return isAffirmativeAnswer(value.value ?? value.answer ?? value.checked);
  }
  return AFFIRMATIVE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

export function normalizeDiagnosticAnswer(step, value) {
  const answerType = String(step?.answer_type || "text").toLowerCase();
  if (answerType === "yes_no") {
    const normalized = String(value || "not_sure").toLowerCase();
    return { value: ["yes", "no", "not_sure"].includes(normalized) ? normalized : "not_sure" };
  }
  if (answerType === "multi_choice") {
    return { value: Array.isArray(value) ? value : [] };
  }
  return { value: value ?? "" };
}

function answerValue(answers, stepKey) {
  return answers?.[stepKey]?.value ?? answers?.[stepKey] ?? null;
}

function answerLabel(step, rawAnswer) {
  const value = rawAnswer?.value ?? rawAnswer;
  if (Array.isArray(value)) return value.join(", ");
  if (value === "not_sure") return "Not sure";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  const options = Array.isArray(step?.options) ? step.options : [];
  return options.find((option) => option.value === value)?.label || String(value ?? "").trim();
}

export function calculateDiagnosticOutcome({ issueType, steps = [], answers = {} } = {}) {
  const flags = {
    emergency: false,
    deposit: false,
    eco: false,
    compliance: false,
  };

  for (const step of steps) {
    const value = answerValue(answers, step.step_key);
    if (!isAffirmativeAnswer(value)) continue;
    if (step.triggers_emergency) flags.emergency = true;
    if (step.triggers_deposit_flag) flags.deposit = true;
    if (step.triggers_eco_upgrade_flag) flags.eco = true;
    if (step.triggers_compliance_flag) flags.compliance = true;
  }

  const issue = String(issueType || "").toLowerCase();
  if (["electrical_issue", "leak", "lost_keys_security"].includes(issue) && flags.emergency) {
    flags.compliance = true;
  }
  if (["damp_mould", "boiler_heating", "no_hot_water"].includes(issue)) {
    if (isAffirmativeAnswer(answerValue(answers, "recurring_issue"))) flags.eco = true;
    if (isAffirmativeAnswer(answerValue(answers, "vulnerable_occupant"))) flags.compliance = true;
  }
  if (["appliance_issue", "door_window_lock", "lost_keys_security"].includes(issue)) {
    if (isAffirmativeAnswer(answerValue(answers, "tenant_damage_possible"))) flags.deposit = true;
  }

  let urgency = "normal";
  let outcomeCategory = "landlord_review";
  let recommendedNextStep = "Review the diagnostic summary and decide whether to request contractor follow-up.";

  if (flags.emergency) {
    urgency = "urgent";
    outcomeCategory = "emergency_review";
    recommendedNextStep = "Treat as urgent and follow emergency provider guidance before any routine workflow.";
  } else if (flags.compliance) {
    urgency = "high";
    outcomeCategory = "compliance_review_possible";
    recommendedNextStep = "Review for possible compliance follow-up and keep the evidence trail visible.";
  } else if (flags.deposit) {
    outcomeCategory = "deposit_evidence_possible";
    recommendedNextStep = "Review as a possible tenant-responsibility indicator before linking any deposit evidence.";
  } else if (flags.eco) {
    outcomeCategory = "eco_upgrade_possible";
    recommendedNextStep = "Review as a possible upgrade opportunity before adding anything to the eco-upgrade plan.";
  }

  return {
    urgency,
    outcomeCategory,
    recommendedNextStep,
    emergencyFlag: flags.emergency,
    depositRelevant: flags.deposit,
    ecoUpgradeRelevant: flags.eco,
    complianceRelevant: flags.compliance,
  };
}

export function buildDiagnosticKeyAnswers({ steps = [], answers = {}, limit = 6 } = {}) {
  return steps
    .map((step) => ({
      stepKey: step.step_key,
      question: step.question,
      answer: answerLabel(step, answerValue(answers, step.step_key)),
    }))
    .filter((entry) => entry.answer)
    .slice(0, limit);
}

export function formatDiagnosticSummary({ issueType, steps = [], answers = {}, outcome = null } = {}) {
  const nextOutcome = outcome || calculateDiagnosticOutcome({ issueType, steps, answers });
  const keyAnswers = buildDiagnosticKeyAnswers({ steps, answers });
  const lines = [
    `Diagnostic summary for landlord review: ${getDiagnosticIssueLabel(issueType)}.`,
    `Outcome: ${nextOutcome.outcomeCategory.replaceAll("_", " ")}. Urgency: ${nextOutcome.urgency}.`,
    `Recommended next step: ${nextOutcome.recommendedNextStep}`,
  ];
  if (keyAnswers.length > 0) {
    lines.push("Key answers:");
    keyAnswers.forEach((entry) => lines.push(`- ${entry.question}: ${entry.answer}`));
  }
  if (nextOutcome.emergencyFlag) lines.push(EMERGENCY_SAFETY_COPY);
  lines.push("Not a substitute for professional advice.");
  return lines.join("\n");
}

export function buildMaintenanceRequestDiagnosticDescription(description, summary) {
  return [description?.trim(), summary?.trim()].filter(Boolean).join("\n\n");
}
