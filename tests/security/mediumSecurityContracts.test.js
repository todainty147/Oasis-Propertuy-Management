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

  it("keeps contractor account context as a navigation hint, not an authorization assumption", () => {
    const context = readSource("src/context/AccountContext.jsx");

    expect(context).toContain(".select(\"id, account_id, created_at\")");
    expect(context).toContain(".limit(25)");
    expect(context).toContain("contractorAccountIds");
    expect(context).toContain("has_multiple_accounts: contractorAccountIds.length > 1");
    expect(context).toContain("navigation hint only");
    expect(context).toContain("must not be treated as an authorization grant");
  });
});
