import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const tempIds = {
  propertyA2: "44444444-4444-4444-4444-444444444499",
  tenantA2: "55555555-5555-5555-5555-555555555599",
  attachmentAllowed: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  attachmentDenied: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
};

const cleanup = {
  documentIds: new Set(),
  documentPaths: new Set(),
  workOrderAttachmentPaths: new Set(),
};

function pdfBlob(label) {
  return new Blob([`%PDF-1.4\n${label}\n%%EOF`], { type: "application/pdf" });
}

function expectRpcDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not permitted") ||
      message.includes("not authenticated") ||
      message.includes("document not found") ||
      message.includes("access denied") ||
      message.includes("row-level security"),
  ).toBe(true);
}

async function createUploadedDocument(client, {
  accountId,
  propertyId = null,
  tenantId = null,
  scope = "account",
  visibility = "staff",
  filename = "security-test.pdf",
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
  const finalDoc = Array.isArray(finalized.data) ? finalized.data[0] : finalized.data;

  const admin = getIntegrationAdminClient();
  const download = await admin.storage.from("documents").download(doc.storage_path);
  expect(download.error).toBeNull();
  expect(download.data).toBeTruthy();

  return finalDoc;
}

async function seedWorkOrderAttachment(admin, {
  id,
  accountId,
  workOrderId,
  uploadedBy,
  storagePath,
}) {
  cleanup.workOrderAttachmentPaths.add(storagePath);

  await admin.storage.from("work-order-attachments").remove([storagePath]);
  const upload = await admin.storage
    .from("work-order-attachments")
    .upload(storagePath, pdfBlob(storagePath), {
      contentType: "application/pdf",
      upsert: false,
    });
  expect(upload.error).toBeNull();

  await admin.from("work_order_attachments").delete().eq("id", id);
  const insert = await admin.from("work_order_attachments").insert({
    id,
    account_id: accountId,
    work_order_id: workOrderId,
    uploaded_by: uploadedBy,
    file_name: storagePath.split("/").at(-1),
    mime_type: "application/pdf",
    file_size: 32,
    storage_bucket: "work-order-attachments",
    storage_path: storagePath,
    kind: "document",
  });

  expect(insert.error).toBeNull();
}

describe.skipIf(!isIntegrationHarnessConfigured())("document and storage security", () => {
  let admin;
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();

    const propertyUpsert = await admin.from("properties").upsert({
      id: tempIds.propertyA2,
      owner_id: seededUsers.ownerA.id,
      account_id: isolationFixtures.accounts.accountA.id,
      address: "12 Starlight Avenue",
      city: "London",
      size: "1 bed",
      rent: 975,
      status: "Wolne",
      tenant_id: null,
    });
    expect(propertyUpsert.error).toBeNull();

    const tenantUpsert = await admin.from("tenants").upsert({
      id: tempIds.tenantA2,
      owner_id: seededUsers.ownerA.id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: tempIds.propertyA2,
      user_id: null,
      name: "Tenant A2",
      email: "tenant-a2-docs@example.com",
      phone: "+447700900099",
      status: "active",
    });
    expect(tenantUpsert.error).toBeNull();

    const propertyUpdate = await admin
      .from("properties")
      .update({ status: "Wynajęte", tenant_id: tempIds.tenantA2 })
      .eq("id", tempIds.propertyA2);
    expect(propertyUpdate.error).toBeNull();
  });

  afterAll(async () => {
    await admin.from("work_order_attachments").delete().in("id", [
      tempIds.attachmentAllowed,
      tempIds.attachmentDenied,
    ]);

    if (cleanup.workOrderAttachmentPaths.size > 0) {
      await admin.storage
        .from("work-order-attachments")
        .remove(Array.from(cleanup.workOrderAttachmentPaths));
    }

    if (cleanup.documentIds.size > 0) {
      await admin.from("documents").delete().in("id", Array.from(cleanup.documentIds));
    }

    if (cleanup.documentPaths.size > 0) {
      await admin.storage.from("documents").remove(Array.from(cleanup.documentPaths));
    }

    await admin.from("tenants").delete().eq("id", tempIds.tenantA2);
    await admin.from("properties").delete().eq("id", tempIds.propertyA2);
  });

  it("allows owner access to own account document metadata and downloads", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const doc = await createUploadedDocument(client, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      tenantId: isolationFixtures.users.tenantA1.tenantId,
      scope: "shared",
      visibility: "tenant",
      filename: "owner-visible.pdf",
    });

    const result = await client.from("documents").select("id, account_id, storage_path").eq("id", doc.id).single();
    expect(result.error).toBeNull();
    expect(result.data?.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const downloaded = await client.storage.from("documents").download(doc.storage_path);
    expect(downloaded.error).toBeNull();
    expect(downloaded.data).toBeTruthy();
  });

  it("allows staff to finalize uploaded documents for their own account", async () => {
    const { client } = await signInAsFixtureUser("staffA");
    const doc = await createUploadedDocument(client, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      scope: "property",
      visibility: "staff",
      filename: "staff-finalize.pdf",
    });

    const result = await client
      .from("documents")
      .select("id, account_id, upload_status, uploaded_by")
      .eq("id", doc.id)
      .single();

    expect(result.error).toBeNull();
    expect(result.data?.account_id).toBe(isolationFixtures.accounts.accountA.id);
    expect(result.data?.upload_status).toBe("uploaded");
    expect(result.data?.uploaded_by).toBeTruthy();

    const downloaded = await client.storage.from("documents").download(doc.storage_path);
    expect(downloaded.error).toBeNull();
    expect(downloaded.data).toBeTruthy();
  });

  it("allows managers to tag documents and records scoped tag audit rows", async () => {
    const { client } = await signInAsFixtureUser("staffA");
    const doc = await createUploadedDocument(client, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      scope: "property",
      visibility: "staff",
      filename: "staff-tagged.pdf",
    });

    const tagged = await client.rpc("set_document_tags", {
      p_document_id: doc.id,
      p_tags: ["UMOWA", "INNE"],
    });

    expect(tagged.error).toBeNull();
    expect(tagged.data).toMatchObject({
      id: doc.id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
    });
    expect(tagged.data.tags).toEqual(["UMOWA", "INNE"]);

    const audit = await admin
      .from("document_audit_log")
      .select("document_id, action, account_id, property_id, tenant_id, performed_by")
      .eq("document_id", doc.id)
      .eq("action", "update_tags")
      .maybeSingle();

    expect(audit.error).toBeNull();
    expect(audit.data).toMatchObject({
      document_id: doc.id,
      action: "update_tags",
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      tenant_id: null,
      performed_by: seededUsers.staffA.id,
    });
  });

  it("denies tenants and contractors from tagging documents", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const doc = await createUploadedDocument(ownerClient, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      tenantId: isolationFixtures.users.tenantA1.tenantId,
      scope: "shared",
      visibility: "tenant",
      filename: "tenant-tag-denied.pdf",
    });

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantTag = await tenantClient.rpc("set_document_tags", {
      p_document_id: doc.id,
      p_tags: ["ID"],
    });
    expectRpcDenied(tenantTag);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorTag = await contractorClient.rpc("set_document_tags", {
      p_document_id: doc.id,
      p_tags: ["PROTOKOL"],
    });
    expectRpcDenied(contractorTag);

    const unchanged = await admin.from("documents").select("id, tags").eq("id", doc.id).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data.tags).toEqual([]);
  });

  it("allows owner document deletion and records security audit context", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const doc = await createUploadedDocument(client, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      tenantId: isolationFixtures.users.tenantA1.tenantId,
      scope: "shared",
      visibility: "tenant",
      filename: "owner-delete-audit.pdf",
    });

    const deleted = await client.rpc("delete_document_and_audit", {
      p_document_id: doc.id,
    });

    expect(deleted.error).toBeNull();

    const lookup = await admin.from("documents").select("id").eq("id", doc.id);
    expect(lookup.error).toBeNull();
    expect(lookup.data).toEqual([]);

    const securityAudit = await admin
      .from("security_audit_ledger")
      .select("action, account_id, actor_user_id, entity_type, entity_id, metadata")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .eq("entity_id", doc.id)
      .eq("action", "document_deleted")
      .maybeSingle();

    expect(securityAudit.error).toBeNull();
    expect(securityAudit.data).toMatchObject({
      action: "document_deleted",
      account_id: isolationFixtures.accounts.accountA.id,
      actor_user_id: seededUsers.ownerA.id,
      entity_type: "document",
      entity_id: doc.id,
      metadata: {
        document_id: doc.id,
        storage_path: doc.storage_path,
        property_id: isolationSeedIds.propertyIds.accountA,
        tenant_id: isolationFixtures.users.tenantA1.tenantId,
        scope: "shared",
        visibility: "tenant",
      },
    });
  });

  it("denies staff and tenants from deleting documents", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const staffDeniedDoc = await createUploadedDocument(ownerClient, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      scope: "property",
      visibility: "staff",
      filename: "staff-delete-denied.pdf",
    });
    const tenantDeniedDoc = await createUploadedDocument(ownerClient, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      tenantId: isolationFixtures.users.tenantA1.tenantId,
      scope: "shared",
      visibility: "tenant",
      filename: "tenant-delete-denied.pdf",
    });

    const { client: staffClient } = await signInAsFixtureUser("staffA");
    const staffDelete = await staffClient.rpc("delete_document_and_audit", {
      p_document_id: staffDeniedDoc.id,
    });
    expectRpcDenied(staffDelete);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantDelete = await tenantClient.rpc("delete_document_and_audit", {
      p_document_id: tenantDeniedDoc.id,
    });
    expectRpcDenied(tenantDelete);

    const lookup = await admin
      .from("documents")
      .select("id")
      .in("id", [staffDeniedDoc.id, tenantDeniedDoc.id]);

    expect(lookup.error).toBeNull();
    expect(lookup.data.map((row) => row.id).sort()).toEqual(
      [staffDeniedDoc.id, tenantDeniedDoc.id].sort(),
    );
  });

  it("uses effective role resolution for full document upload authorization when legacy role and role_id drift", async () => {
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
        filename: "effective-role-doc.pdf",
      });

      expect(doc?.account_id).toBe(accountId);
      expect(doc?.id).toBeTruthy();
    } finally {
      await restoreMembership();
    }
  });

  it("denies cross-account document metadata and downloads", async () => {
    const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
    const doc = await createUploadedDocument(ownerBClient, {
      accountId: isolationFixtures.accounts.accountB.id,
      propertyId: isolationSeedIds.propertyIds.accountB,
      tenantId: isolationFixtures.users.tenantB1.tenantId,
      scope: "shared",
      visibility: "tenant",
      filename: "account-b-only.pdf",
    });

    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const result = await ownerAClient.from("documents").select("id").eq("id", doc.id);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);

    const downloaded = await ownerAClient.storage.from("documents").download(doc.storage_path);
    expect(downloaded.data ?? null).toBeNull();
    expect(downloaded.error).toBeTruthy();
  });

  it("allows tenant access only to tenant-visible documents in their own property scope", async () => {
    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const doc = await createUploadedDocument(ownerAClient, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: isolationSeedIds.propertyIds.accountA,
      tenantId: isolationFixtures.users.tenantA1.tenantId,
      scope: "shared",
      visibility: "tenant",
      filename: "tenant-a1-visible.pdf",
    });

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const result = await tenantClient.from("documents").select("id, tenant_id, property_id").eq("id", doc.id).single();
    expect(result.error).toBeNull();
    expect(result.data?.tenant_id).toBe(isolationFixtures.users.tenantA1.tenantId);
    expect(result.data?.property_id).toBe(isolationSeedIds.propertyIds.accountA);

    const downloaded = await tenantClient.storage.from("documents").download(doc.storage_path);
    expect(downloaded.error).toBeNull();
    expect(downloaded.data).toBeTruthy();
  });

  it("denies tenant access to tenant-visible documents outside their property/tenant scope", async () => {
    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const doc = await createUploadedDocument(ownerAClient, {
      accountId: isolationFixtures.accounts.accountA.id,
      propertyId: tempIds.propertyA2,
      tenantId: tempIds.tenantA2,
      scope: "shared",
      visibility: "tenant",
      filename: "tenant-a2-only.pdf",
    });

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const result = await tenantClient.from("documents").select("id").eq("id", doc.id);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);

    const downloaded = await tenantClient.storage.from("documents").download(doc.storage_path);
    expect(downloaded.data ?? null).toBeNull();
    expect(downloaded.error).toBeTruthy();
  });

  it("allows contractor access only to attachments on their assigned work orders", async () => {
    const storagePath = `account/${isolationFixtures.accounts.accountA.id}/work_orders/${isolationSeedIds.workOrderIds.accountA}/assigned-contractor.pdf`;
    await seedWorkOrderAttachment(admin, {
      id: tempIds.attachmentAllowed,
      accountId: isolationFixtures.accounts.accountA.id,
      workOrderId: isolationSeedIds.workOrderIds.accountA,
      uploadedBy: seededUsers.ownerA.id,
      storagePath,
    });

    const { client } = await signInAsFixtureUser("contractorA1");
    const result = await client.from("work_order_attachments").select("id, work_order_id, storage_path").eq("id", tempIds.attachmentAllowed).single();
    expect(result.error).toBeNull();
    expect(result.data?.work_order_id).toBe(isolationSeedIds.workOrderIds.accountA);

    const signed = await client.storage.from("work-order-attachments").createSignedUrl(storagePath, 60);
    expect(signed.error).toBeNull();
  });

  it("denies contractor access to attachments on foreign work orders", async () => {
    const storagePath =
      `account/${isolationFixtures.accounts.accountB.id}/work_orders/${isolationSeedIds.workOrderIds.accountB}/not-assigned.pdf`;
    await seedWorkOrderAttachment(admin, {
      id: tempIds.attachmentDenied,
      accountId: isolationFixtures.accounts.accountB.id,
      workOrderId: isolationSeedIds.workOrderIds.accountB,
      uploadedBy: seededUsers.ownerB.id,
      storagePath,
    });

    const { client } = await signInAsFixtureUser("contractorA1");
    const result = await client.from("work_order_attachments").select("id").eq("id", tempIds.attachmentDenied);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);

    const signed = await client.storage.from("work-order-attachments").createSignedUrl(storagePath, 60);
    expect(signed.data ?? null).toBeNull();
    expect(signed.error).toBeTruthy();
  });

  it("restricts document storage upload to a matching in-scope account path", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const invalidPath = `${isolationFixtures.accounts.accountB.id}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/forbidden.pdf`;

    const upload = await client.storage.from("documents").upload(invalidPath, pdfBlob("forbidden"), {
      contentType: "application/pdf",
      upsert: false,
    });

    expect(upload.data ?? null).toBeNull();
    expect(upload.error).toBeTruthy();
  });
});
