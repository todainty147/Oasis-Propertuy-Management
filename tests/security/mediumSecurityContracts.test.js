import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function normalized(source) {
  return source.replace(/\s+/g, " ");
}

describe("medium security audit contracts", () => {
  it("validates HMRC live pilot draft ids before Supabase OR filter construction", () => {
    const source = readSource("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");
    const compact = normalized(source);
    const fnStart = compact.indexOf("async function assertPilotEvidencePassed");
    const uuidCheck = compact.indexOf("if (!UUID_RE.test(draftId))", fnStart);
    const fromCall = compact.indexOf('.from("hmrc_live_pilot_evidence")', fnStart);
    const orFilter = compact.indexOf(".or(`draft_id.is.null,draft_id.eq.${draftId}`)", fnStart);

    expect(source).toContain("const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;");
    expect(uuidCheck).toBeGreaterThan(fnStart);
    expect(uuidCheck).toBeLessThan(fromCall);
    expect(uuidCheck).toBeLessThan(orFilter);
    expect(source).toContain('throw new HttpError("Invalid quarterly draft id.", 400)');
  });

  it("does not reveal reset-password update fields from URL recovery markers alone", () => {
    const source = readSource("src/pages/ResetPassword.jsx");
    const compact = normalized(source);
    const markerBlock = compact.slice(
      compact.indexOf("const hasRecoveryMarker"),
      compact.indexOf("// PKCE recovery links can include ?code=..."),
    );

    expect(markerBlock).toContain("setRecoveryIntent(true)");
    expect(markerBlock).not.toContain("setIsRecovery(true)");
    expect(source).toContain("exchangeCodeForSession(code)");
    expect(source).toContain('verifyOtp({');
    expect(source).toContain('event === "PASSWORD_RECOVERY"');
    expect(source).toContain('setError(t("reset.invalidOrExpired"))');
    expect(source).toContain("recoverySessionEstablished");
    expect(source).toContain("validatePasswordStrength(newPassword)");
    expect(source).not.toContain("onClick={() => setIsRecovery(true)}");
  });

  it("keeps password reset request flow visible when no recovery session is established", () => {
    const source = readSource("src/pages/ResetPassword.jsx");

    expect(source).toContain("onSubmit={isRecovery ? saveNewPassword : requestReset}");
    expect(source).toContain("!isRecovery ? (");
    expect(source).toContain("requestPasswordResetEmail(clean");
    expect(readSource("src/i18n/messages.js")).toContain(
      "This password reset link is invalid or has expired. Please request a new reset email.",
    );
  });

  it("uses backend/refetched account state for self-serve signup bootstrap instead of hardcoded trial plan", () => {
    const context = readSource("src/context/AccountContext.jsx");
    const contracts = readSource("src/services/rpcContracts.js");
    const sql = readSource("supabase/self_serve_landlord_signup.sql");
    const migration = readSource("supabase/migrations/20260616001000_self_serve_signup_return_account_state.sql");
    const bootstrapBlock = context.slice(
      context.indexOf("const signupIntent"),
      context.indexOf("if (!autoBootstrapEnabled)"),
    );

    expect(context).toContain("loadSelfServeAccountSnapshot(newId, user.id)");
    expect(bootstrapBlock).toContain("accountRow.subscription_plan || row?.subscription_plan || null");
    expect(bootstrapBlock).toContain("accountRow.subscription_status || row?.subscription_status || null");
    expect(bootstrapBlock).not.toContain('subscription_plan: "starter"');
    expect(bootstrapBlock).not.toContain('subscription_status: "trialing"');
    expect(contracts).toContain("subscription_plan: toNullableString(value.subscription_plan)");
    expect(contracts).toContain("trial_ends_at: toNullableString(value.trial_ends_at)");
    for (const source of [sql, migration]) {
      expect(source).toContain("'subscription_plan'");
      expect(source).toContain("'subscription_status'");
      expect(source).toContain("'trial_ends_at'");
      expect(source).toContain("'trial_source'");
    }
  });

  it("selects the active account deterministically with localStorage memory for all users (E-138)", () => {
    const context = readSource("src/context/AccountContext.jsx");

    expect(context).toContain('.order("created_at", { ascending: true })');

    const selectionBlock = context.slice(
      context.indexOf("const stored = localStorage.getItem"),
      context.indexOf("setActiveAccountId(nextId)"),
    );
    expect(selectionBlock).toContain("validStored ? stored : accs[0]");
    expect(selectionBlock).toContain("rootOperator");
  });

  it("validates non-root stored account against own memberships, not all accounts (E-138 deny)", () => {
    const context = readSource("src/context/AccountContext.jsx");

    const selectionBlock = context.slice(
      context.indexOf("const stored = localStorage.getItem"),
      context.indexOf("setActiveAccountId(nextId)"),
    );

    expect(selectionBlock).toContain('accs.some((a) => a.id === stored)');

    const nonRootBranch = selectionBlock.slice(
      selectionBlock.lastIndexOf("validStored"),
    );
    expect(nonRootBranch).toContain("validStored ? stored : accs[0]");
    expect(nonRootBranch).not.toMatch(/accs\[0\].*\?\?.*null\s*;?\s*$/m);

    const rootListBlock = context.slice(
      context.indexOf("if (rootOperator && rootMembership"),
      context.indexOf("if (!rootOperator)"),
    );
    expect(rootListBlock).toContain("rootListAccounts");

    const nonRootFilterBlock = context.slice(
      context.indexOf("if (!rootOperator)"),
      context.indexOf("const accountFeatureFlags"),
    );
    expect(nonRootFilterBlock).toContain("accs.filter");
  });

  it("cleans up provenance finance test accounts to prevent data accumulation (E-137)", () => {
    const source = readSource("tests/integration/provenanceFinanceCutoverSecurity.test.js");

    expect(source).toContain("createdAccountIds.push(accountId)");
    expect(source).toContain("cleanupProvenanceTestMemberships");
    expect(source).toContain("afterAll");
    expect(source).toContain('like("name", "Provenance reconciliation %")');
  });

  it("keeps contractor account context as a navigation hint, not an authorization assumption", () => {
    const context = readSource("src/context/AccountContext.jsx");

    expect(context).toContain(".select(\"id, account_id, created_at\")");
    expect(context).toContain(".limit(25)");
    expect(context).toContain("contractorAccountIds");
    expect(context).toContain("has_multiple_accounts: contractorAccountIds.length > 1");
    expect(context).toContain("navigation hint only");
    expect(context).toContain("must not be treated as an authorization grant");
  });

  // ── E-035 Phase A-1 contracts ────────────────────────────────────────────────

  it("compliance service recording uses the provenance-backed path, not only updateComplianceSafeItem (E-035)", () => {
    const svc = readSource("src/services/legalSecurityService.js");
    // The strong service path must exist and call the Sprint 3 provenance RPC.
    expect(svc).toContain("recordComplianceServiceAsserted");
    expect(svc).toContain("recordDocumentServedAsserted");
    // The service function must delegate to the provenance layer, not only write the DB row.
    expect(svc).toContain("getServiceProjectionForComplianceItem");
  });

  it("document upload wires provenance best-effort after finalize (E-144 Phase A-1)", () => {
    const svc = readSource("src/services/documentService.js");
    // Upload provenance must be additive: fired after finalize succeeds.
    expect(svc).toContain("recordDocumentUploaded");
    // Must not block upload — the call must be fire-and-forget with a catch handler.
    expect(svc).toContain(".catch(");
    // Failed provenance write must be logged, not silently swallowed.
    expect(svc).toContain("record_document_uploaded_provenance");
  });

  it("compliance safe page exposes provenance-backed service recording to users (E-035)", () => {
    const page = readSource("src/pages/compliance/ComplianceSafePage.jsx");
    expect(page).toContain("recordComplianceServiceAsserted");
    expect(page).toContain("onRecordService");
    expect(page).toContain("deriveComplianceServiceStatus");
    expect(page).toContain("hasProvenanceServiceEvent");
  });

  it("no UI copy implies legally valid service in compliance safe (E-035 overclaim test)", () => {
    const page = readSource("src/pages/compliance/ComplianceSafePage.jsx");
    const lower = page.toLowerCase();
    expect(lower).not.toContain("validly served");
    expect(lower).not.toContain("legally served");
    expect(lower).not.toContain("compliant service");
    expect(lower).not.toContain("section 21 compliant");
    expect(lower).not.toContain("proof of valid service");
    // The acceptable wording is present
    expect(lower).toContain("service recorded");
    expect(lower).toContain("service recorded ≠ legally valid service");
  });

  // E-035 fold tripwire — stays red until served_at is fully retired from updateComplianceSafeItem.
  // When this test passes, the bifurcation is closed and E-035 can be marked resolved.
  it("E-035 TRIPWIRE: served_at write in updateComplianceSafeItem must be retired before E-035 closes", () => {
    const svc = readSource("src/services/legalSecurityService.js");
    // GREEN: served_at write removed from updateComplianceSafeItem in Phase A-2.1.
    // The bifurcation is closed — served_at is no longer an independently writable
    // service-truth field.
    expect(svc).not.toMatch(/nextPatch\.served_at\s*=/);
  });

  // ── E-084 OCR false-compliance gate contracts ────────────────────────────────

  it("COMPLIANCE_SELECT includes the three E-084 verification columns (E-084 schema contract)", () => {
    const svc = readSource("src/services/legalSecurityService.js");
    expect(svc).toContain("ocr_source_extraction_id");
    expect(svc).toContain("human_verified_at");
    expect(svc).toContain("human_verified_by");
  });

  it("recordHumanVerification calls record_compliance_value_human_verified RPC (E-084 call site)", () => {
    const svc = readSource("src/services/legalSecurityService.js");
    expect(svc).toContain('rpc("record_compliance_value_human_verified"');
  });

  it("deriveComplianceItemStatus gates OCR-sourced unverified items via OCR_GATED_STATUSES (E-084 gate contract)", () => {
    const src = readSource("src/lib/complianceSafeStatus.js");
    expect(src).toContain("ocr_source_extraction_id");
    expect(src).toContain("human_verified_at");
    expect(src).toContain("OCR_GATED_STATUSES");
  });

  it("compliance safe page imports recordHumanVerification and wires onVerifyExtraction (E-084 UI contract)", () => {
    const page = readSource("src/pages/compliance/ComplianceSafePage.jsx");
    expect(page).toContain("recordHumanVerification");
    expect(page).toContain("onVerifyExtraction");
    expect(page).toContain("handleVerifyExtraction");
  });

  // E-084 fold tripwire — stays RED in Branch B until Phase A-2 wires the provenance event.
  // Branch B wires the RPC call site; Phase A-2 adds the provenance emission inside the SQL function.
  // When this test passes, E-084 can move from REDUCED to CLOSED.
  it("E-084 TRIPWIRE: record_compliance_value_human_verified must emit a provenance event before E-084 closes", () => {
    const sql = readSource("supabase/compliance_safe_e084_interim_gate.sql");
    // GREEN: Phase A-2.1 wired _append_evidence_provenance_event inside the function body.
    expect(sql).toMatch(/append_evidence_provenance_event|append_provenance_event|record_provenance_event/);
  });
});
