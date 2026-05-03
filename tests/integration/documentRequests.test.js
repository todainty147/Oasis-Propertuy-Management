import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const cleanup = {
  requestIds: new Set(),
  documentIds: new Set(),
  documentPaths: new Set(),
};

function pdfBlob(label) {
  return new Blob([`%PDF-1.4\n${label}\n%%EOF`], { type: "application/pdf" });
}

function expectDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not permitted") ||
      message.includes("row-level security") ||
      message.includes("request not found") ||
      message.includes("upload not found") ||
      message.includes("permission denied"),
  ).toBe(true);
}

async function createTenantRequest(client, title = "Tenant ID evidence") {
  const result = await client.rpc("create_document_request", {
    p_account_id: isolationFixtures.accounts.accountA.id,
    p_target_role: "tenant",
    p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    p_contractor_id: null,
    p_property_id: isolationFixtures.users.tenantA1.propertyId,
    p_template_id: null,
    p_request_type: "id_document",
    p_title: title,
    p_instructions: "Upload a clear copy of your ID.",
    p_due_at: null,
  });

  expect(result.error).toBeNull();
  expect(result.data?.id).toBeTruthy();
  cleanup.requestIds.add(result.data.id);
  return result.data;
}

async function createContractorRequest(client, title = "Contractor insurance") {
  const result = await client.rpc("create_document_request", {
    p_account_id: isolationFixtures.accounts.accountA.id,
    p_target_role: "contractor",
    p_tenant_id: null,
    p_contractor_id: isolationFixtures.users.contractorA1.contractorId,
    p_property_id: null,
    p_template_id: null,
    p_request_type: "insurance_certificate",
    p_title: title,
    p_instructions: "Upload current public liability insurance.",
    p_due_at: null,
  });

  expect(result.error).toBeNull();
  expect(result.data?.id).toBeTruthy();
  cleanup.requestIds.add(result.data.id);
  return result.data;
}

async function uploadForRequest(client, request, filename) {
  const stub = await client.rpc("create_document_request_upload_stub", {
    p_request_id: request.id,
    p_filename: filename,
    p_mime_type: "application/pdf",
    p_size_bytes: 32,
  });

  expect(stub.error).toBeNull();
  const doc = Array.isArray(stub.data) ? stub.data[0] : stub.data;
  expect(doc?.id).toBeTruthy();
  expect(doc?.storage_path).toBeTruthy();
  cleanup.documentIds.add(doc.id);
  cleanup.documentPaths.add(doc.storage_path);

  const storage = await client.storage.from("documents").upload(doc.storage_path, pdfBlob(filename), {
    contentType: "application/pdf",
    upsert: false,
  });
  expect(storage.error).toBeNull();

  const finalized = await client.rpc("finalize_document_request_upload", {
    p_document_id: doc.id,
    p_size_bytes: 32,
    p_mime_type: "application/pdf",
    p_original_filename: filename,
  });
  expect(finalized.error).toBeNull();
  expect(finalized.data?.review_status).toBe("pending_review");

  return finalized.data;
}

describe.skipIf(!isIntegrationHarnessConfigured())("document request intake security", () => {
  let admin;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
  });

  afterAll(async () => {
    if (cleanup.documentPaths.size > 0) {
      await admin.storage.from("documents").remove(Array.from(cleanup.documentPaths));
    }
    if (cleanup.documentIds.size > 0) {
      await admin.from("documents").delete().in("id", Array.from(cleanup.documentIds));
    }
    if (cleanup.requestIds.size > 0) {
      await admin.from("document_requests").delete().in("id", Array.from(cleanup.requestIds));
    }
  });

  it("lets managers request tenant documents while keeping the request tenant-scoped", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const request = await createTenantRequest(ownerClient);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantRead = await tenantClient
      .from("document_requests")
      .select("id, account_id, target_role, tenant_id, title")
      .eq("id", request.id)
      .single();

    expect(tenantRead.error).toBeNull();
    expect(tenantRead.data).toMatchObject({
      id: request.id,
      account_id: isolationFixtures.accounts.accountA.id,
      target_role: "tenant",
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
    });

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorRead = await contractorClient
      .from("document_requests")
      .select("id")
      .eq("id", request.id);
    expect(contractorRead.error).toBeNull();
    expect(contractorRead.data).toHaveLength(0);

    const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
    const crossAccountRead = await ownerBClient
      .from("document_requests")
      .select("id")
      .eq("id", request.id);
    expect(crossAccountRead.error).toBeNull();
    expect(crossAccountRead.data).toHaveLength(0);
  });

  it("lets a tenant upload to their request and only managers review the upload", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const request = await createTenantRequest(ownerClient, "Tenant bank receipt");

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const doc = await uploadForRequest(tenantClient, request, "tenant-receipt.pdf");

    const download = await tenantClient.storage.from("documents").download(doc.storage_path);
    expect(download.error).toBeNull();
    expect(download.data).toBeTruthy();

    const tenantUploadRow = await tenantClient
      .from("document_request_uploads")
      .select("id, document_id")
      .eq("document_id", doc.id)
      .single();
    expect(tenantUploadRow.error).toBeNull();

    const tenantReview = await tenantClient.rpc("review_document_request_upload", {
      p_upload_id: tenantUploadRow.data.id,
      p_review_status: "accepted",
      p_review_note: null,
    });
    expectDenied(tenantReview);

    const uploadRow = await ownerClient
      .from("document_request_uploads")
      .select("id, document_id, review_status")
      .eq("document_id", doc.id)
      .single();
    expect(uploadRow.error).toBeNull();

    const reviewed = await ownerClient.rpc("review_document_request_upload", {
      p_upload_id: uploadRow.data.id,
      p_review_status: "accepted",
      p_review_note: "Looks good",
    });

    expect(reviewed.error).toBeNull();
    expect(reviewed.data?.review_status).toBe("accepted");
  });

  it("supports contractor document requests without exposing them to tenants", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const request = await createContractorRequest(ownerClient);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorRead = await contractorClient
      .from("document_requests")
      .select("id, target_role, contractor_id")
      .eq("id", request.id)
      .single();

    expect(contractorRead.error).toBeNull();
    expect(contractorRead.data).toMatchObject({
      id: request.id,
      target_role: "contractor",
      contractor_id: isolationFixtures.users.contractorA1.contractorId,
    });

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantRead = await tenantClient
      .from("document_requests")
      .select("id")
      .eq("id", request.id);
    expect(tenantRead.error).toBeNull();
    expect(tenantRead.data).toHaveLength(0);

    const doc = await uploadForRequest(contractorClient, request, "contractor-insurance.pdf");
    const ownerUpload = await ownerClient
      .from("document_request_uploads")
      .select("id, document_id, uploaded_by_role, review_status")
      .eq("document_id", doc.id)
      .single();

    expect(ownerUpload.error).toBeNull();
    expect(ownerUpload.data).toMatchObject({
      document_id: doc.id,
      uploaded_by_role: "contractor",
      review_status: "pending_review",
    });
  });
});
