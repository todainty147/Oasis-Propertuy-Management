import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const tempIds = {
  complianceItemA: "77777777-7777-7777-7777-777777777771",
};

const cleanup = {
  documentIds: new Set(),
  documentPaths: new Set(),
  linkIds: new Set(),
};

function pdfBlob(label) {
  return new Blob([`%PDF-1.4\n${label}\n%%EOF`], { type: "application/pdf" });
}

function expectDeniedOrNoRows(result) {
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  if (result.error) {
    const message = String(result.error.message || "").toLowerCase();
    expect(
      message.includes("not allowed") ||
        message.includes("not permitted") ||
        message.includes("permission") ||
        message.includes("row-level security") ||
        message.includes("violates row-level security") ||
        message.includes("forbidden"),
    ).toBe(true);
    return;
  }

  expect(rows).toHaveLength(0);
}

async function createUploadedDocument(client, {
  accountId,
  propertyId = null,
  tenantId = null,
  scope = "account",
  visibility = "staff",
  filename = "compliance-link-test.pdf",
}) {
  const stub = await client.rpc("create_document_stub", {
    p_account_id: accountId,
    p_scope: scope,
    p_visibility: visibility,
    p_property_id: propertyId,
    p_tenant_id: tenantId,
    p_filename: filename,
    p_mime_type: "application/pdf",
    p_size_bytes: 32,
    p_tags: [],
  });

  expect(stub.error).toBeNull();
  const doc = Array.isArray(stub.data) ? stub.data[0] : stub.data;
  expect(doc?.id).toBeTruthy();
  expect(doc?.storage_path).toBeTruthy();

  cleanup.documentIds.add(doc.id);
  cleanup.documentPaths.add(doc.storage_path);

  const upload = await client.storage.from("documents").upload(doc.storage_path, pdfBlob(filename), {
    contentType: "application/pdf",
    upsert: false,
  });
  expect(upload.error).toBeNull();

  const finalized = await client.rpc("finalize_document_upload", {
    p_document_id: doc.id,
    p_size_bytes: 32,
    p_mime_type: "application/pdf",
    p_original_filename: filename,
    p_tags: [],
  });

  expect(finalized.error).toBeNull();
  return Array.isArray(finalized.data) ? finalized.data[0] : finalized.data;
}

describe.skipIf(!isIntegrationHarnessConfigured())("compliance document links security", () => {
  let admin;
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();

    const complianceItemUpsert = await admin.from("compliance_items").upsert({
      id: tempIds.complianceItemA,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      tenant_id: null,
      title: "Gas certificate",
      category: "GAS_SAFETY",
      due_date: "2026-04-30",
      status: "active",
      reminder_window_days: 30,
      notes: null,
    });
    expect(complianceItemUpsert.error).toBeNull();
  });

  afterAll(async () => {
    if (cleanup.linkIds.size > 0) {
      await admin.from("compliance_document_links").delete().in("id", Array.from(cleanup.linkIds));
    }

    if (cleanup.documentIds.size > 0) {
      await admin.from("documents").delete().in("id", Array.from(cleanup.documentIds));
    }

    if (cleanup.documentPaths.size > 0) {
      await admin.storage.from("documents").remove(Array.from(cleanup.documentPaths));
    }

    await admin.from("compliance_items").delete().eq("id", tempIds.complianceItemA);
  });

  it("allows managers to link and read compliance documents", async () => {
    const { client } = await signInAsFixtureUser("adminA");
    const doc = await createUploadedDocument(client, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      scope: "property",
      visibility: "staff",
      filename: "compliance-link-admin.pdf",
    });

    const linkId = randomUUID();
    const insertResult = await client
      .from("compliance_document_links")
      .insert({
        id: linkId,
        account_id: isolationFixtures.accounts.accountA.id,
        compliance_item_id: tempIds.complianceItemA,
        document_id: doc.id,
      })
      .select("id, account_id, compliance_item_id, document_id")
      .single();

    expect(insertResult.error).toBeNull();
    cleanup.linkIds.add(linkId);
    expect(insertResult.data).toMatchObject({
      id: linkId,
      account_id: isolationFixtures.accounts.accountA.id,
      compliance_item_id: tempIds.complianceItemA,
      document_id: doc.id,
    });

    const readResult = await client
      .from("compliance_document_links")
      .select("id, account_id, compliance_item_id, document_id")
      .eq("id", linkId)
      .single();

    expect(readResult.error).toBeNull();
    expect(readResult.data).toMatchObject({
      id: linkId,
      account_id: isolationFixtures.accounts.accountA.id,
    });
  });

  it("denies tenants from linking compliance documents", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const doc = await createUploadedDocument(ownerClient, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      scope: "property",
      visibility: "staff",
      filename: "compliance-link-tenant.pdf",
    });

    const { client } = await signInAsFixtureUser("tenantA1");
    const result = await client
      .from("compliance_document_links")
      .insert({
        id: randomUUID(),
        account_id: isolationFixtures.accounts.accountA.id,
        compliance_item_id: tempIds.complianceItemA,
        document_id: doc.id,
      })
      .select("id");

    expectDeniedOrNoRows(result);
  });

  it("uses effective role resolution for compliance link writes when legacy role and role_id drift", async () => {
    const accountId = isolationFixtures.accounts.accountA.id;
    const adminRoleLookup = await admin
      .from("roles")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();

    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const targetUserId = seededUsers.adminA.id;
    const restoreMembership = async () => {
      const { error } = await admin
        .from("account_members")
        .update({ role: "admin" })
        .eq("account_id", accountId)
        .eq("user_id", targetUserId);

      if (error) throw error;
    };

    const { error: demoteError } = await admin
      .from("account_members")
      .update({ role: "tenant" })
      .eq("account_id", accountId)
      .eq("user_id", targetUserId);

    if (demoteError) throw demoteError;

    const { error: driftError } = await admin
      .from("account_members")
      .update({ role_id: adminRoleLookup.data.id })
      .eq("account_id", accountId)
      .eq("user_id", targetUserId);

    if (driftError) throw driftError;

    try {
      const { client } = await signInAsFixtureUser("adminA");
      const doc = await createUploadedDocument(client, {
        accountId,
        propertyId: isolationSeedIds.propertyIds.accountA,
        scope: "property",
        visibility: "staff",
        filename: "compliance-link-drift.pdf",
      });

      const linkId = randomUUID();
      const insertResult = await client
        .from("compliance_document_links")
        .insert({
          id: linkId,
          account_id: accountId,
          compliance_item_id: tempIds.complianceItemA,
          document_id: doc.id,
        })
        .select("id, account_id, compliance_item_id, document_id")
        .single();

      expect(insertResult.error).toBeNull();
      cleanup.linkIds.add(linkId);
      expect(insertResult.data).toMatchObject({
        id: linkId,
        account_id: accountId,
        compliance_item_id: tempIds.complianceItemA,
        document_id: doc.id,
      });
    } finally {
      await restoreMembership();
    }
  });
});
