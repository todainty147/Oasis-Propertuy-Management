import { describe, expect, it } from "vitest";
import {
  calculateDiagnosticOutcome,
  EMERGENCY_SAFETY_COPY,
  formatDiagnosticSummary,
  normalizeDiagnosticAnswer,
} from "../../src/lib/maintenanceDiagnostics";

const steps = [
  {
    step_key: "emergency_risk",
    question: "Is there immediate danger?",
    answer_type: "yes_no",
    triggers_emergency: true,
    triggers_compliance_flag: true,
  },
  {
    step_key: "tenant_damage_possible",
    question: "Is there visible damage or signs of misuse?",
    answer_type: "yes_no",
    triggers_deposit_flag: true,
  },
  {
    step_key: "recurring_issue",
    question: "Has this happened before?",
    answer_type: "yes_no",
    triggers_eco_upgrade_flag: true,
  },
];

describe("maintenance diagnostics", () => {
  it("marks emergency answers urgent and includes safe emergency copy", () => {
    const answers = {
      emergency_risk: { value: "yes" },
    };

    const outcome = calculateDiagnosticOutcome({
      issueType: "electrical_issue",
      steps,
      answers,
    });

    expect(outcome).toMatchObject({
      urgency: "urgent",
      outcomeCategory: "emergency_review",
      emergencyFlag: true,
      complianceRelevant: true,
    });
    expect(formatDiagnosticSummary({ issueType: "electrical_issue", steps, answers, outcome })).toContain(
      EMERGENCY_SAFETY_COPY,
    );
  });

  it("uses possible evidence and upgrade wording without automatic action language", () => {
    const answers = {
      tenant_damage_possible: { value: "yes" },
      recurring_issue: { value: "yes" },
    };

    const outcome = calculateDiagnosticOutcome({
      issueType: "door_window_lock",
      steps,
      answers,
    });
    const summary = formatDiagnosticSummary({ issueType: "door_window_lock", steps, answers, outcome });

    expect(outcome.depositRelevant).toBe(true);
    expect(outcome.ecoUpgradeRelevant).toBe(true);
    expect(summary).toContain("landlord review");
    expect(summary).toContain("possible tenant-responsibility indicator");
    expect(summary).toContain("Not a substitute for professional advice");
    expect(summary).not.toMatch(/you are responsible|tenant is liable|deduct from deposit automatically|no contractor needed|no contractor required|this diagnosis confirms/i);
  });

  it("normalizes yes/no answers into safe values", () => {
    expect(normalizeDiagnosticAnswer({ answer_type: "yes_no" }, "maybe")).toEqual({ value: "not_sure" });
    expect(normalizeDiagnosticAnswer({ answer_type: "yes_no" }, "yes")).toEqual({ value: "yes" });
  });

  it("marks recurring damp and vulnerable hot-water issues for review without promising outcomes", () => {
    const dampOutcome = calculateDiagnosticOutcome({
      issueType: "damp_mould",
      steps,
      answers: { recurring_issue: { value: "yes" } },
    });
    expect(dampOutcome).toMatchObject({
      outcomeCategory: "eco_upgrade_possible",
      ecoUpgradeRelevant: true,
    });

    const complianceSteps = [
      ...steps,
      { step_key: "vulnerable_occupant", question: "Is a vulnerable occupant affected?", answer_type: "yes_no" },
    ];
    const complianceOutcome = calculateDiagnosticOutcome({
      issueType: "no_hot_water",
      steps: complianceSteps,
      answers: { vulnerable_occupant: { value: "yes" } },
    });
    const summary = formatDiagnosticSummary({
      issueType: "no_hot_water",
      steps: complianceSteps,
      answers: { vulnerable_occupant: { value: "yes" } },
      outcome: complianceOutcome,
    });

    expect(complianceOutcome).toMatchObject({
      urgency: "high",
      outcomeCategory: "compliance_review_possible",
      complianceRelevant: true,
    });
    expect(summary).not.toMatch(/guaranteed epc improvement|guaranteed/i);
  });
});
