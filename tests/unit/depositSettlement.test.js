import { describe, expect, it } from "vitest";

import {
  buildDepositSettlementStatement,
  calculateSettlementTotals,
  DEPOSIT_STATEMENT_DISCLAIMER,
} from "../../src/services/depositSettlementService";
import { buildDisputePackItemsFromSettlement } from "../../src/lib/depositDisputePack";

describe("Deposit settlement helpers", () => {
  it("calculates settlement totals and evidence readiness", () => {
    const totals = calculateSettlementTotals({
      deposit_held_amount: 1000,
      deductions: [
        { amount: 125, evidence_status: "attached" },
        { amount: "50.50", evidenceLinks: [{ evidence_type: "invoice_document" }] },
        { amount: 25, evidence_status: "missing" },
      ],
    });

    expect(totals.proposedDeductionsTotal).toBe(200.5);
    expect(totals.proposedReturnAmount).toBe(799.5);
    expect(totals.evidenceAttachedCount).toBe(2);
    expect(totals.missingEvidenceCount).toBe(1);
    expect(totals.readyForStatement).toBe(false);
  });

  it("flags negative proposed returns for landlord review without blocking draft creation", () => {
    const totals = calculateSettlementTotals({
      depositHeldAmount: 100,
      deductions: [{ amount: 150, evidence_status: "attached" }],
    });
    expect(totals.proposedReturnAmount).toBe(-50);
    expect(totals.negativeReturnWarning).toBe(true);
    expect(totals.needsReview).toBe(true);
  });

  it("builds an itemised statement with safe disclaimer copy", () => {
    const statement = buildDepositSettlementStatement({
      id: "settlement-1",
      jurisdiction: "UK",
      properties: { address: "10 Test Street" },
      tenants: { name: "Alex Tenant" },
      deductions: [
        {
          id: "d1",
          title: "Cleaning",
          deduction_type: "cleaning",
          amount: 75,
          description: "End of tenancy cleaning",
          evidenceLinks: [{
            id: "internal-link-id",
            account_id: "account-1",
            deduction_id: "d1",
            evidence_type: "invoice_document",
            evidence_id: "internal-document-id",
            evidence_label: "Cleaning invoice",
            notes: "Invoice received from contractor.",
          }],
        },
      ],
    });
    expect(statement.brand).toBe("Tenaqo");
    expect(statement.title).toBe("Deposit Settlement Statement");
    expect(statement.deductions[0]).toMatchObject({ title: "Cleaning", amount: 75 });
    expect(statement.deductions[0].evidence[0]).toEqual({
      deductionNumber: 1,
      type: "invoice_document",
      label: "Cleaning invoice",
      notes: "Invoice received from contractor.",
    });
    expect(statement.evidenceIndex[0]).toEqual({
      number: 1,
      deductionNumber: 1,
      type: "invoice_document",
      label: "Cleaning invoice",
      notes: "Invoice received from contractor.",
    });
    expect(JSON.stringify(statement)).not.toMatch(/internal-link-id|internal-document-id|account-1|deduction_id/);
    expect(statement.disclaimer).toBe(DEPOSIT_STATEMENT_DISCLAIMER);
    expect(statement.disclaimer).not.toMatch(/money holding|guaranteed|court-proof/i);
  });

  it("imports settlement deductions into dispute pack references", () => {
    const items = buildDisputePackItemsFromSettlement({
      id: "settlement-1",
      proposed_deductions_total: 180,
      deductions: [{ id: "deduction-1", title: "Damage", amount: 180 }],
    });
    expect(items).toHaveLength(2);
    expect(items[0].evidence_reference_type).toBe("deposit_settlement_statement");
    expect(items[1].evidence_reference_type).toBe("deposit_deduction");
    expect(items[1].claimed_amount).toBe(180);
  });
});
