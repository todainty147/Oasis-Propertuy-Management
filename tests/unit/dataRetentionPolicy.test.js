import { describe, expect, it } from "vitest";

import {
  RETENTION_ACTIONS,
  canTransitionDeletionRequest,
  getRetentionDecision,
} from "../../src/lib/dataRetentionPolicy";

describe("data retention policy mapping", () => {
  it("retains finance, audit, compliance, and billing records by default", () => {
    expect(getRetentionDecision("finance_ledger").action).toBe(RETENTION_ACTIONS.RETAIN);
    expect(getRetentionDecision("audit_security_logs").action).toBe(RETENTION_ACTIONS.RETAIN);
    expect(getRetentionDecision("compliance_records").action).toBe(RETENTION_ACTIONS.RETAIN);
    expect(getRetentionDecision("billing_subscription_records").action).toBe(RETENTION_ACTIONS.RETAIN);
  });

  it("deletes revocable/transient user data by default", () => {
    expect(getRetentionDecision("device_tokens").action).toBe(RETENTION_ACTIONS.DELETE);
    expect(getRetentionDecision("notifications").action).toBe(RETENTION_ACTIONS.DELETE);
    expect(getRetentionDecision("memberships").action).toBe(RETENTION_ACTIONS.DELETE);
  });

  it("anonymises role/person profiles without promising operational hard delete", () => {
    expect(getRetentionDecision("user_profile").action).toBe(RETENTION_ACTIONS.ANONYMISE);
    expect(getRetentionDecision("tenant_profiles").action).toBe(RETENTION_ACTIONS.ANONYMISE);
    expect(getRetentionDecision("contractor_profiles").action).toBe(RETENTION_ACTIONS.ANONYMISE);
  });
});

describe("deletion request state machine", () => {
  it("allows review and processing transitions", () => {
    expect(canTransitionDeletionRequest("submitted", "pending_admin_review")).toBe(true);
    expect(canTransitionDeletionRequest("pending_admin_review", "approved")).toBe(true);
    expect(canTransitionDeletionRequest("approved", "scheduled")).toBe(true);
    expect(canTransitionDeletionRequest("scheduled", "completed")).toBe(true);
  });

  it("does not reopen terminal states", () => {
    expect(canTransitionDeletionRequest("completed", "approved")).toBe(false);
    expect(canTransitionDeletionRequest("rejected", "approved")).toBe(false);
    expect(canTransitionDeletionRequest("cancelled", "approved")).toBe(false);
  });
});
