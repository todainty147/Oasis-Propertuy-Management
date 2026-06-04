import { describe, expect, it } from "vitest";
import {
  evaluateHmrcLivePilotReadiness,
  HMRC_LIVE_PILOT_BLOCK_REASONS,
} from "../../src/lib/mtd/hmrcLivePilotGuard.js";

const passingInput = Object.freeze({
  features: {
    hmrc_mtd_live_submission: true,
    hmrc_mtd_live_submission_pilot: true,
  },
  allowlisted: true,
  userRole: "owner",
  draft: {
    status: "locked",
    reviewed_at: "2026-06-03T12:00:00Z",
    locked_at: "2026-06-03T12:10:00Z",
  },
  unresolvedIssueCount: 0,
  consent: { consentId: "consent-1", stale: false },
  connection: {
    environment: "live",
    connection_status: "connected",
    refresh_token_expires_at: "2026-12-01T00:00:00Z",
  },
  hmrcBaseUrl: "https://api.service.hmrc.gov.uk",
  supportRunbookReady: true,
});

describe("HMRC live pilot readiness evaluator", () => {
  it("is false by default and requires allowlisting", () => {
    const result = evaluateHmrcLivePilotReadiness();

    expect(result.allowed).toBe(false);
    expect(result.blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.ACCOUNT_NOT_ALLOWLISTED);
  });

  it("blocks tenants and contractors", () => {
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, userRole: "tenant" }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.USER_NOT_OWNER_OR_ADMIN);
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, userRole: "contractor" }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.USER_NOT_OWNER_OR_ADMIN);
  });

  it("blocks non-allowlisted accounts", () => {
    const result = evaluateHmrcLivePilotReadiness({ ...passingInput, allowlisted: false });

    expect(result.allowed).toBe(false);
    expect(result.blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.ACCOUNT_NOT_ALLOWLISTED);
  });

  it("blocks stale consent, unlocked drafts and draft issues", () => {
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, consent: { consentId: "c", stale: true } }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.STALE_CONSENT);
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, draft: { ...passingInput.draft, status: "reviewed" } }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.DRAFT_NOT_LOCKED);
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, unresolvedIssueCount: 1 }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.DRAFT_HAS_ISSUES);
  });

  it("blocks sandbox environment and duplicate successful live submission", () => {
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, hmrcBaseUrl: "https://test-api.service.hmrc.gov.uk" }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.SANDBOX_BASE_URL_USED);
    expect(evaluateHmrcLivePilotReadiness({ ...passingInput, draft: { ...passingInput.draft, live_submission_status: "success" } }).blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.DUPLICATE_LIVE_SUBMISSION);
  });

  it("reports missing production URL without also claiming sandbox URL is used", () => {
    const result = evaluateHmrcLivePilotReadiness({ ...passingInput, hmrcBaseUrl: "" });

    expect(result.blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.PRODUCTION_BASE_URL_MISSING);
    expect(result.blocked).not.toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.SANDBOX_BASE_URL_USED);
  });

  it("blocks expired live tokens even when expiry fields are present", () => {
    const result = evaluateHmrcLivePilotReadiness({
      ...passingInput,
      connection: {
        environment: "live",
        connection_status: "connected",
        access_token_expires_at: "2026-01-01T00:00:00Z",
        refresh_token_expires_at: "2026-01-02T00:00:00Z",
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked).toContain(HMRC_LIVE_PILOT_BLOCK_REASONS.LIVE_TOKEN_NOT_REFRESHABLE);
  });

  it("passes only when every preflight condition is true", () => {
    const result = evaluateHmrcLivePilotReadiness(passingInput);

    expect(result).toEqual({ allowed: true, blocked: [] });
  });
});
