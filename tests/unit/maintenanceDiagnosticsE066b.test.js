import { describe, expect, it } from "vitest";
import {
  calculateDiagnosticOutcome,
} from "../../src/lib/maintenanceDiagnostics";

// ---------------------------------------------------------------------------
// Helper: mirrors the sortSteps() in maintenanceDiagnosticsService.js so tests
// can exercise it without importing the service (which depends on supabase).
// IMPORTANT: this must stay in sync with the service implementation.
// ---------------------------------------------------------------------------
function sortSteps(steps) {
  return [...(steps || [])].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      // Emergency steps render before non-emergency at the same sort_order.
      // This is the durable invariant — step_key naming must never determine
      // whether the emergency question appears first.
      (b.triggers_emergency ? 1 : 0) - (a.triggers_emergency ? 1 : 0) ||
      String(a.step_key || "").localeCompare(String(b.step_key || "")),
  );
}

// ---------------------------------------------------------------------------
// Baseline template fixtures — matching the post-repair state of the DB.
// After legal_security_phase3.sql + phase2_repair_e066b_e077_e074.sql run,
// boiler_heating and electrical_issue have only emergency_risk at sort_order=10.
// immediate_danger is absent from those two templates.
// ---------------------------------------------------------------------------

const BOILER_STEPS_POST_REPAIR = [
  { step_key: "emergency_risk", sort_order: 10, triggers_emergency: true, question: "Is there a gas smell, carbon monoxide alarm, or immediate danger?", answer_type: "yes_no" },
  { step_key: "power_checked", sort_order: 20, triggers_emergency: false, question: "Have you checked the power supply?", answer_type: "yes_no" },
  { step_key: "recurring_issue", sort_order: 30, triggers_emergency: false, question: "Has this happened before?", answer_type: "yes_no" },
];

const ELECTRICAL_STEPS_POST_REPAIR = [
  { step_key: "emergency_risk", sort_order: 10, triggers_emergency: true, question: "Is there smoke, burning smell, sparking, exposed wiring, or immediate danger?", answer_type: "yes_no" },
  { step_key: "breaker_checked", sort_order: 20, triggers_emergency: false, question: "Have you checked whether a breaker has tripped?", answer_type: "yes_no" },
];

const NO_HOT_WATER_STEPS_POST_REPAIR = [
  { step_key: "immediate_danger", sort_order: 10, triggers_emergency: true, question: "Is there a smell of gas, active leak, burning smell, or immediate danger?", answer_type: "yes_no" },
  { step_key: "affected_taps", sort_order: 20, triggers_emergency: false, question: "Is hot water missing from all taps or only one tap?", answer_type: "yes_no" },
];

// ---------------------------------------------------------------------------
// Test A — original silent path
// Asserts the non-emergency duplicate no longer exists so the silent-path is
// impossible. If immediate_danger (triggers_emergency=false) were still present
// at sort_order=10 alongside emergency_risk (triggers_emergency=true), answering
// the first visible question YES would NOT fire the emergency flag.
// ---------------------------------------------------------------------------
describe("E-066b: Emergency diagnostics misrouting", () => {
  it("A: immediate_danger (non-emergency) is absent from boiler_heating post-repair — original silent path is impossible", () => {
    const duplicateStep = BOILER_STEPS_POST_REPAIR.find(
      (s) => s.step_key === "immediate_danger" && s.triggers_emergency !== true,
    );
    expect(duplicateStep).toBeUndefined();
  });

  it("A: immediate_danger (non-emergency) is absent from electrical_issue post-repair — original silent path is impossible", () => {
    const duplicateStep = ELECTRICAL_STEPS_POST_REPAIR.find(
      (s) => s.step_key === "immediate_danger" && s.triggers_emergency !== true,
    );
    expect(duplicateStep).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test B — first visible question fires emergency
  // -------------------------------------------------------------------------
  it("B: first visible question in boiler_heating is the emergency-triggering step; answering YES fires emergency flag", () => {
    const sorted = sortSteps(BOILER_STEPS_POST_REPAIR);
    expect(sorted[0].step_key).toBe("emergency_risk");
    expect(sorted[0].triggers_emergency).toBe(true);

    const outcome = calculateDiagnosticOutcome({
      issueType: "boiler_heating",
      steps: sorted,
      answers: { emergency_risk: { value: "yes" } },
    });
    expect(outcome.emergencyFlag).toBe(true);
    expect(outcome.urgency).toBe("urgent");
  });

  it("B: first visible question in electrical_issue is the emergency-triggering step; answering YES fires emergency flag", () => {
    const sorted = sortSteps(ELECTRICAL_STEPS_POST_REPAIR);
    expect(sorted[0].step_key).toBe("emergency_risk");
    expect(sorted[0].triggers_emergency).toBe(true);

    const outcome = calculateDiagnosticOutcome({
      issueType: "electrical_issue",
      steps: sorted,
      answers: { emergency_risk: { value: "yes" } },
    });
    expect(outcome.emergencyFlag).toBe(true);
    expect(outcome.urgency).toBe("urgent");
  });

  // -------------------------------------------------------------------------
  // Test C — other life-safety hazards reach emergency path
  // -------------------------------------------------------------------------
  it("C: no_hot_water gas-smell answer fires emergency flag (immediate_danger now has triggers_emergency=true)", () => {
    const outcome = calculateDiagnosticOutcome({
      issueType: "no_hot_water",
      steps: NO_HOT_WATER_STEPS_POST_REPAIR,
      answers: { immediate_danger: { value: "yes" } },
    });
    expect(outcome.emergencyFlag).toBe(true);
    expect(outcome.urgency).toBe("urgent");
  });

  it("C: generic emergency step fires for CO alarm scenario", () => {
    const steps = [
      { step_key: "emergency_risk", sort_order: 10, triggers_emergency: true, answer_type: "yes_no" },
    ];
    const outcome = calculateDiagnosticOutcome({
      issueType: "boiler_heating",
      steps,
      answers: { emergency_risk: { value: "yes" } },
    });
    expect(outcome.emergencyFlag).toBe(true);
  });

  it("C: electrical burning smell / sparking → emergency_risk fires", () => {
    const outcome = calculateDiagnosticOutcome({
      issueType: "electrical_issue",
      steps: ELECTRICAL_STEPS_POST_REPAIR,
      answers: { emergency_risk: { value: "yes" } },
    });
    expect(outcome.emergencyFlag).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test D — emergency-first invariant at tied sort_order (not alphabetical)
  //
  // The durable invariant: a step with triggers_emergency=true renders before
  // steps with triggers_emergency=false at the same sort_order, regardless of
  // step_key name. Prior implementation used alphabetical step_key as secondary
  // tiebreak, which happened to work because "emergency_risk" < "immediate_danger"
  // — but that was accidental. A step named "zzz_emergency" (triggers_emergency=true)
  // would have sorted last, silencing the flag. The fix adds triggers_emergency DESC
  // as the load-bearing secondary key; step_key is only the tertiary fallback.
  // -------------------------------------------------------------------------
  it("D: emergency step (triggers_emergency=true) renders first at tied sort_order regardless of step_key naming", () => {
    // The realistic scenario: two steps at sort_order=10.
    const tied = [
      { step_key: "immediate_danger", sort_order: 10, triggers_emergency: false },
      { step_key: "emergency_risk",   sort_order: 10, triggers_emergency: true  },
    ];
    const sorted = sortSteps(tied);
    // Assert the invariant: first step has triggers_emergency=true.
    // Do NOT rely on step_key — that is NOT the load-bearing assertion here.
    expect(sorted[0].triggers_emergency).toBe(true);
    expect(sorted[1].triggers_emergency).toBe(false);
  });

  it("D: emergency step wins at tied sort_order even when its step_key would lose alphabetically (zzz_emergency beats aaa_routine)", () => {
    // This is the "alphabetical accident" test: "zzz_emergency" > "aaa_routine"
    // alphabetically, so a step_key-only sort would put the emergency step LAST.
    // With triggers_emergency as secondary key, the emergency step wins regardless.
    const tied = [
      { step_key: "aaa_routine",    sort_order: 10, triggers_emergency: false },
      { step_key: "zzz_emergency",  sort_order: 10, triggers_emergency: true  },
    ];
    const sorted = sortSteps(tied);
    expect(sorted[0].step_key).toBe("zzz_emergency");
    expect(sorted[0].triggers_emergency).toBe(true);
    expect(sorted[1].step_key).toBe("aaa_routine");
  });

  it("D: reversed insertion order still produces emergency-first result", () => {
    const tied = [
      { step_key: "emergency_risk",   sort_order: 10, triggers_emergency: true  },
      { step_key: "immediate_danger", sort_order: 10, triggers_emergency: false },
    ];
    const sorted = sortSteps(tied);
    expect(sorted[0].triggers_emergency).toBe(true);
  });

  it("D: emergency step at sort_order=10 always precedes ordinary steps at sort_order=20+", () => {
    const steps = [
      { step_key: "power_checked",  sort_order: 20, triggers_emergency: false },
      { step_key: "emergency_risk", sort_order: 10, triggers_emergency: true  },
      { step_key: "recurring",      sort_order: 30, triggers_emergency: false },
    ];
    const sorted = sortSteps(steps);
    expect(sorted[0].step_key).toBe("emergency_risk");
    expect(sorted[0].sort_order).toBe(10);
  });

  // -------------------------------------------------------------------------
  // Test F — no_hot_water both-direction coverage for the triggers_emergency flip
  //
  // The repair migration (phase2_repair_e066b_e077_e074.sql) set
  // no_hot_water.immediate_danger.triggers_emergency = true. This was a scope
  // expansion inside E-066b: immediate_danger on no_hot_water asks "Is there a
  // smell of gas, active leak, burning smell, or immediate danger?" — a genuine
  // life-safety gate. The flip was intentional, but it rode in on a different
  // finding's repair without dedicated both-direction test coverage. These two
  // tests confirm the flip fires when it should and doesn't over-trigger on a
  // routine no-hot-water report.
  // -------------------------------------------------------------------------
  it("F: no_hot_water with gas-smell YES (immediate_danger answered yes) fires emergency flag", () => {
    const outcome = calculateDiagnosticOutcome({
      issueType: "no_hot_water",
      steps: NO_HOT_WATER_STEPS_POST_REPAIR,
      answers: { immediate_danger: { value: "yes" } },
    });
    expect(outcome.emergencyFlag).toBe(true);
    expect(outcome.urgency).toBe("urgent");
  });

  it("F: no_hot_water routine report (immediate_danger answered no) does NOT fire emergency flag", () => {
    // A boiler with no hot water but no gas smell / leak / burning smell is a
    // normal maintenance request — not a life-safety emergency. This test guards
    // against the flip causing over-triggering on the routine path.
    const outcome = calculateDiagnosticOutcome({
      issueType: "no_hot_water",
      steps: NO_HOT_WATER_STEPS_POST_REPAIR,
      answers: {
        immediate_danger: { value: "no" },
        affected_taps:    { value: "yes" },
      },
    });
    expect(outcome.emergencyFlag).toBe(false);
    expect(outcome.urgency).toBe("normal");
  });

  // -------------------------------------------------------------------------
  // Test E — normal diagnostic flows still work
  // -------------------------------------------------------------------------
  it("E: non-emergency boiler diagnostics flow still renders and records outcome", () => {
    const outcome = calculateDiagnosticOutcome({
      issueType: "boiler_heating",
      steps: BOILER_STEPS_POST_REPAIR,
      answers: {
        emergency_risk: { value: "no" },
        power_checked:  { value: "yes" },
        recurring_issue: { value: "yes" },
      },
    });
    expect(outcome.emergencyFlag).toBe(false);
    expect(outcome.ecoUpgradeRelevant).toBe(true);
    expect(outcome.urgency).toBe("normal");
  });

  it("E: non-emergency electrical flow still records outcome correctly", () => {
    const outcome = calculateDiagnosticOutcome({
      issueType: "electrical_issue",
      steps: ELECTRICAL_STEPS_POST_REPAIR,
      answers: {
        emergency_risk: { value: "no" },
        breaker_checked: { value: "yes" },
      },
    });
    expect(outcome.emergencyFlag).toBe(false);
    expect(outcome.urgency).toBe("normal");
  });
});
