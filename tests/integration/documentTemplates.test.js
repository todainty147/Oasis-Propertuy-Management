import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const cleanup = {
  templateIds: new Set(),
  templatePaths: new Set(),
};

function pdfBytes(label) {
  return new Uint8Array(Buffer.from(`%PDF-1.4\n${label}\n%%EOF`));
}

function expectDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not permitted") ||
      message.includes("row-level security") ||
      message.includes("template not found") ||
      message.includes("permission denied"),
  ).toBe(true);
}

async function createTemplateStub(client, accountId, name = "AST template") {
  const result = await client.rpc("create_document_template_stub", {
    p_account_id: accountId,
    p_country_code: "GB",
    p_language: "en",
    p_template_type: "tenancy_agreement",
    p_name: name,
    p_description: "Integration test template",
    p_filename: `${name}.pdf`,
    p_mime_type: "application/pdf",
    p_size_bytes: 32,
  });

  expect(result.error).toBeNull();
  const template = Array.isArray(result.data) ? result.data[0] : result.data;
  expect(template?.id).toBeTruthy();
  expect(template?.storage_path).toContain("/templates/");
  cleanup.templateIds.add(template.id);
  cleanup.templatePaths.add(template.storage_path);
  return template;
}

describe.skipIf(!isIntegrationHarnessConfigured())("document template repository security", () => {
  let admin;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
  });

  afterAll(async () => {
    if (cleanup.templatePaths.size > 0) {
      await admin.storage.from("documents").remove(Array.from(cleanup.templatePaths));
    }
    if (cleanup.templateIds.size > 0) {
      await admin
        .from("document_templates")
        .delete()
        .in("id", Array.from(cleanup.templateIds));
    }
  });

  it("allows an owner to create, finalize, read, and archive an in-account template", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const template = await createTemplateStub(
      client,
      isolationFixtures.accounts.accountA.id,
      "Owner AST template",
    );

    const upload = await admin.storage
      .from("documents")
      .upload(template.storage_path, pdfBytes("owner-template"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(upload.error).toBeNull();

    const finalized = await client.rpc("finalize_document_template_upload", {
      p_template_id: template.id,
      p_size_bytes: 32,
      p_mime_type: "application/pdf",
    });
    expect(finalized.error).toBeNull();
    expect(finalized.data?.status).toBe("active");
    expect(finalized.data?.upload_status).toBe("uploaded");

    const download = await admin.storage.from("documents").download(template.storage_path);
    expect(download.error).toBeNull();
    expect(download.data).toBeTruthy();

    const read = await client
      .from("document_templates")
      .select("id, account_id, country_code, template_type, status")
      .eq("id", template.id)
      .single();
    expect(read.error).toBeNull();
    expect(read.data).toMatchObject({
      id: template.id,
      account_id: isolationFixtures.accounts.accountA.id,
      country_code: "GB",
      template_type: "tenancy_agreement",
      status: "active",
    });

    const archived = await client.rpc("archive_document_template", {
      p_template_id: template.id,
    });
    expect(archived.error).toBeNull();
    expect(archived.data?.status).toBe("archived");
  });

  it("repairs a legacy stub path before upload", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const template = await createTemplateStub(
      client,
      isolationFixtures.accounts.accountA.id,
      "Legacy repair template",
    );

    const legacyPath = `${isolationFixtures.accounts.accountA.id}/Legacy repair template`;
    cleanup.templatePaths.delete(template.storage_path);
    cleanup.templatePaths.add(legacyPath);

    const forceLegacyPath = await admin
      .from("document_templates")
      .update({ storage_path: legacyPath })
      .eq("id", template.id)
      .select("id, storage_path")
      .single();
    expect(forceLegacyPath.error).toBeNull();
    expect(forceLegacyPath.data?.storage_path).toBe(legacyPath);

    const repaired = await client.rpc("repair_document_template_stub_path", {
      p_template_id: template.id,
      p_filename: "legacy-template.pdf",
    });
    expect(repaired.error).toBeNull();
    expect(repaired.data?.storage_path).toMatch(
      new RegExp(`^${isolationFixtures.accounts.accountA.id}/templates/${template.id}/legacy-template\\.pdf$`),
    );

    cleanup.templatePaths.delete(legacyPath);
    cleanup.templatePaths.add(repaired.data.storage_path);

    const upload = await admin.storage
      .from("documents")
      .upload(repaired.data.storage_path, pdfBytes("legacy-repair-template"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(upload.error).toBeNull();
  });

  it("allows staff to read templates but denies template management", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createTemplateStub(
      ownerClient,
      isolationFixtures.accounts.accountA.id,
      "Staff readable template",
    );

    const upload = await admin.storage
      .from("documents")
      .upload(template.storage_path, pdfBytes("staff-readable-template"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(upload.error).toBeNull();

    const finalize = await ownerClient.rpc("finalize_document_template_upload", {
      p_template_id: template.id,
      p_size_bytes: 32,
      p_mime_type: "application/pdf",
    });
    expect(finalize.error).toBeNull();

    const { client: staffClient } = await signInAsFixtureUser("staffA");
    const read = await staffClient
      .from("document_templates")
      .select("id, account_id, name")
      .eq("id", template.id)
      .single();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(template.id);

    const createAttempt = await staffClient.rpc("create_document_template_stub", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_country_code: "GB",
      p_language: "en",
      p_template_type: "contractor_assignment",
      p_name: "Staff should not create",
      p_description: null,
      p_filename: "staff-template.pdf",
      p_mime_type: "application/pdf",
      p_size_bytes: 32,
    });
    expectDenied(createAttempt);

    const archiveAttempt = await staffClient.rpc("archive_document_template", {
      p_template_id: template.id,
    });
    expectDenied(archiveAttempt);
  });

  it("denies tenant, contractor, and cross-account reads", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createTemplateStub(
      ownerClient,
      isolationFixtures.accounts.accountA.id,
      "Isolated template",
    );

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantRead = await tenantClient
      .from("document_templates")
      .select("id")
      .eq("id", template.id);
    expect(tenantRead.error).toBeNull();
    expect(tenantRead.data).toHaveLength(0);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorRead = await contractorClient
      .from("document_templates")
      .select("id")
      .eq("id", template.id);
    expect(contractorRead.error).toBeNull();
    expect(contractorRead.data).toHaveLength(0);

    const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
    const crossAccountRead = await ownerBClient
      .from("document_templates")
      .select("id")
      .eq("id", template.id);
    expect(crossAccountRead.error).toBeNull();
    expect(crossAccountRead.data).toHaveLength(0);

    const crossAccountArchive = await ownerBClient.rpc("archive_document_template", {
      p_template_id: template.id,
    });
    expectDenied(crossAccountArchive);
  });
});
