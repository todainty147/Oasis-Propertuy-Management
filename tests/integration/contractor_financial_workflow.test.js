import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("contractor financial workflow writes", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;
  let tempWorkOrderId;
  let tempOtherWorkOrderId;

  async function cleanupTempRows() {
    if (tempWorkOrderId) {
      const { error: finError } = await admin
        .from("work_order_financials")
        .delete()
        .eq("work_order_id", tempWorkOrderId);

      if (finError) throw finError;

      const { error: woError } = await admin
        .from("work_orders")
        .delete()
        .eq("id", tempWorkOrderId);

      if (woError) throw woError;
    }

    if (tempOtherWorkOrderId) {
      const { error: finError } = await admin
        .from("work_order_financials")
        .delete()
        .eq("work_order_id", tempOtherWorkOrderId);

      if (finError) throw finError;

      const { error: woError } = await admin
        .from("work_orders")
        .delete()
        .eq("id", tempOtherWorkOrderId);

      if (woError) throw woError;
    }

    tempWorkOrderId = null;
    tempOtherWorkOrderId = null;
  }

  async function createTempWorkOrder({
    accountId = isolationFixtures.accounts.accountA.id,
    propertyId = isolationSeedIds.propertyIds.accountA,
    requestId = isolationSeedIds.requestIds.accountA,
    contractorUserId = seededUsers.contractorA1.id,
    contractorName = "Contractor A1",
    contractorPhone = "+447700900101",
    createdBy = seededUsers.ownerA.id,
    kind = "primary",
  } = {}) {
    const workOrderId = randomUUID();
    const { error } = await admin.from("work_orders").insert({
      id: workOrderId,
      account_id: accountId,
      property_id: propertyId,
      maintenance_request_id: requestId,
      contractor_user_id: contractorUserId,
      contractor_name: contractorName,
      contractor_phone: contractorPhone,
      status: "assigned",
      notes: null,
      created_by: createdBy,
    });

    if (error) throw error;

    if (kind === "primary") tempWorkOrderId = workOrderId;
    if (kind === "other") tempOtherWorkOrderId = workOrderId;
    return workOrderId;
  }

  async function getFinancials(workOrderId) {
    const { data, error } = await admin
      .from("work_order_financials")
      .select("account_id, work_order_id, quote_amount, quote_currency, quote_notes, quote_status, quote_submitted_by, invoice_amount, invoice_currency, invoice_issued_at, invoice_due_at, approved_by, rejected_by, rejection_reason")
      .eq("work_order_id", workOrderId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    await cleanupTempRows();
  });

  it("allows the assigned contractor to save a quote draft only on their own account-scoped work order", async () => {
    await createTempWorkOrder();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("wo_fin_upsert_quote_draft", {
      p_work_order_id: tempWorkOrderId,
      p_quote_amount: 275,
      p_quote_currency: "GBP",
      p_quote_notes: "integration quote draft",
    });

    expect(result.error).toBeNull();
    expect(result.data.quote_status).toBe("draft");
    expect(Number(result.data.quote_amount)).toBe(275);
    expect(result.data.quote_currency).toBe("GBP");
    expect(result.data.quote_notes).toBe("integration quote draft");

    const financials = await getFinancials(tempWorkOrderId);
    expect(financials).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      work_order_id: tempWorkOrderId,
      quote_status: "draft",
      quote_currency: "GBP",
      quote_notes: "integration quote draft",
    });
    expect(Number(financials.quote_amount)).toBe(275);
  });

  it("denies a non-assigned contractor from saving a quote draft on another contractor's work order", async () => {
    await createTempWorkOrder();
    const { client } = await signInAsFixtureUser("contractorB1");

    const result = await client.rpc("wo_fin_upsert_quote_draft", {
      p_work_order_id: tempWorkOrderId,
      p_quote_amount: 325,
      p_quote_currency: "GBP",
      p_quote_notes: "foreign contractor attempt",
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("contractor only");
    expect(await getFinancials(tempWorkOrderId)).toBeNull();
  });

  it("denies tenant and owner from contractor-only quote submission writes", async () => {
    await createTempWorkOrder();

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantResult = await tenantClient.rpc("wo_fin_submit_quote", {
      p_work_order_id: tempWorkOrderId,
    });

    expect(tenantResult.data ?? null).toBeNull();
    expect(String(tenantResult.error?.message || "").toLowerCase()).toContain("contractor only");

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const ownerResult = await ownerClient.rpc("wo_fin_submit_quote", {
      p_work_order_id: tempWorkOrderId,
    });

    expect(ownerResult.data ?? null).toBeNull();
    expect(String(ownerResult.error?.message || "").toLowerCase()).toContain("contractor only");
    expect(await getFinancials(tempWorkOrderId)).toBeNull();
  });

  it("allows the assigned contractor to submit a draft quote and persists submitted_by only on the seeded work order", async () => {
    await createTempWorkOrder();
    const { client, user } = await signInAsFixtureUser("contractorA1");

    const draftResult = await client.rpc("wo_fin_upsert_quote_draft", {
      p_work_order_id: tempWorkOrderId,
      p_quote_amount: 410,
      p_quote_currency: "GBP",
      p_quote_notes: "submit this quote",
    });

    expect(draftResult.error).toBeNull();

    const submitResult = await client.rpc("wo_fin_submit_quote", {
      p_work_order_id: tempWorkOrderId,
    });

    expect(submitResult.error).toBeNull();
    expect(submitResult.data.quote_status).toBe("submitted");
    expect(submitResult.data.quote_submitted_by).toBe(user.id);

    const financials = await getFinancials(tempWorkOrderId);
    expect(financials.quote_status).toBe("submitted");
    expect(financials.quote_submitted_by).toBe(user.id);
    expect(Number(financials.quote_amount)).toBe(410);
  });

  it("allows in-account staff to reject a submitted quote but denies cross-account approval attempts", async () => {
    await createTempWorkOrder();
    await createTempWorkOrder({
      accountId: isolationFixtures.accounts.accountB.id,
      propertyId: isolationSeedIds.propertyIds.accountB,
      requestId: isolationSeedIds.requestIds.accountB,
      contractorUserId: seededUsers.contractorB1.id,
      contractorName: "Contractor B1",
      contractorPhone: "+447700900202",
      createdBy: seededUsers.ownerB.id,
      kind: "other",
    });

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const submitResult = await contractorClient.rpc("wo_fin_upsert_quote_draft", {
      p_work_order_id: tempWorkOrderId,
      p_quote_amount: 510,
      p_quote_currency: "GBP",
      p_quote_notes: "needs staff review",
    });

    expect(submitResult.error).toBeNull();
    const submitQuoteResult = await contractorClient.rpc("wo_fin_submit_quote", {
      p_work_order_id: tempWorkOrderId,
    });
    expect(submitQuoteResult.error).toBeNull();

    const { client: staffClient, user: staffUser } = await signInAsFixtureUser("staffA");
    const rejectResult = await staffClient.rpc("wo_fin_reject_quote", {
      p_work_order_id: tempWorkOrderId,
      p_reason: "integration staff rejection",
    });

    expect(rejectResult.error).toBeNull();
    expect(rejectResult.data.quote_status).toBe("rejected");
    expect(rejectResult.data.rejected_by).toBe(staffUser.id);
    expect(rejectResult.data.rejection_reason).toBe("integration staff rejection");

    const rejectedFinancials = await getFinancials(tempWorkOrderId);
    expect(rejectedFinancials.quote_status).toBe("rejected");
    expect(rejectedFinancials.rejected_by).toBe(staffUser.id);
    expect(rejectedFinancials.rejection_reason).toBe("integration staff rejection");

    const crossAccountApprove = await staffClient.rpc("wo_fin_approve_quote", {
      p_work_order_id: tempOtherWorkOrderId,
    });

    expect(crossAccountApprove.data ?? null).toBeNull();
    expect(String(crossAccountApprove.error?.message || "").toLowerCase()).toContain("manager only");
  });

  it("allows invoice save only after manager approval and only for the assigned contractor", async () => {
    await createTempWorkOrder();
    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");

    const draftResult = await contractorClient.rpc("wo_fin_upsert_quote_draft", {
      p_work_order_id: tempWorkOrderId,
      p_quote_amount: 650,
      p_quote_currency: "GBP",
      p_quote_notes: "invoice after approval",
    });
    expect(draftResult.error).toBeNull();

    const submitResult = await contractorClient.rpc("wo_fin_submit_quote", {
      p_work_order_id: tempWorkOrderId,
    });
    expect(submitResult.error).toBeNull();

    const earlyInvoiceResult = await contractorClient.rpc("wo_fin_upsert_invoice", {
      p_work_order_id: tempWorkOrderId,
      p_invoice_amount: 650,
      p_invoice_currency: "GBP",
      p_invoice_issued_at: "2026-03-19T10:00:00.000Z",
      p_invoice_due_at: "2026-03-26T10:00:00.000Z",
    });

    expect(earlyInvoiceResult.data ?? null).toBeNull();
    expect(String(earlyInvoiceResult.error?.message || "").toLowerCase()).toContain("after quote approved");

    const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
    const approveResult = await ownerClient.rpc("wo_fin_approve_quote", {
      p_work_order_id: tempWorkOrderId,
    });

    expect(approveResult.error).toBeNull();
    expect(approveResult.data.quote_status).toBe("approved");
    expect(approveResult.data.approved_by).toBe(ownerUser.id);

    const invoiceResult = await contractorClient.rpc("wo_fin_upsert_invoice", {
      p_work_order_id: tempWorkOrderId,
      p_invoice_amount: 700,
      p_invoice_currency: "GBP",
      p_invoice_issued_at: "2026-03-19T10:00:00.000Z",
      p_invoice_due_at: "2026-03-26T10:00:00.000Z",
    });

    expect(invoiceResult.error).toBeNull();
    expect(Number(invoiceResult.data.invoice_amount)).toBe(700);
    expect(invoiceResult.data.invoice_currency).toBe("GBP");

    const financials = await getFinancials(tempWorkOrderId);
    expect(financials.account_id).toBe(isolationFixtures.accounts.accountA.id);
    expect(Number(financials.invoice_amount)).toBe(700);
    expect(financials.invoice_currency).toBe("GBP");
    expect(String(financials.invoice_issued_at)).toContain("2026-03-19");
    expect(String(financials.invoice_due_at)).toContain("2026-03-26");
  });
});
