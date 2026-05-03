import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const cleanup = {
  packetIds: new Set(),
  templateIds: new Set(),
  signatureSettingAccountIds: new Set(),
  documentIds: new Set(),
};

function expectDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not permitted") ||
      message.includes("row-level security") ||
      message.includes("packet not found") ||
      message.includes("template not found") ||
      message.includes("permission denied") ||
      message.includes("cannot be completed") ||
      message.includes("signature provider") ||
      message.includes("not ready") ||
      message.includes("not configured"),
  ).toBe(true);
}

async function createActiveTemplate(client, name = "Packet AST template") {
  const stub = await client.rpc("create_document_template_stub", {
    p_account_id: isolationFixtures.accounts.accountA.id,
    p_country_code: "GB",
    p_language: "en",
    p_template_type: "tenancy_agreement",
    p_name: name,
    p_description: "Packet integration template",
    p_filename: `${name}.pdf`,
    p_mime_type: "application/pdf",
    p_size_bytes: 32,
  });

  expect(stub.error).toBeNull();
  const template = Array.isArray(stub.data) ? stub.data[0] : stub.data;
  cleanup.templateIds.add(template.id);

  const finalized = await client.rpc("finalize_document_template_upload", {
    p_template_id: template.id,
    p_size_bytes: 32,
    p_mime_type: "application/pdf",
  });
  expect(finalized.error).toBeNull();
  expect(finalized.data?.status).toBe("active");
  return finalized.data;
}

async function createTenantPacket(client, template, title = "Tenant agreement packet") {
  const result = await client.rpc("create_document_packet", {
    p_account_id: isolationFixtures.accounts.accountA.id,
    p_template_id: template.id,
    p_target_role: "tenant",
    p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    p_contractor_id: null,
    p_property_id: isolationFixtures.users.tenantA1.propertyId,
    p_packet_type: "agreement",
    p_title: title,
    p_message: "Please review this agreement.",
  });

  expect(result.error).toBeNull();
  expect(result.data?.id).toBeTruthy();
  cleanup.packetIds.add(result.data.id);
  return result.data;
}

async function createContractorPacket(client, template, title = "Contractor terms packet") {
  const result = await client.rpc("create_document_packet", {
    p_account_id: isolationFixtures.accounts.accountA.id,
    p_template_id: template.id,
    p_target_role: "contractor",
    p_tenant_id: null,
    p_contractor_id: isolationFixtures.users.contractorA1.contractorId,
    p_property_id: null,
    p_packet_type: "contractor_terms",
    p_title: title,
    p_message: "Please review these terms.",
  });

  expect(result.error).toBeNull();
  expect(result.data?.id).toBeTruthy();
  cleanup.packetIds.add(result.data.id);
  return result.data;
}

describe.skipIf(!isIntegrationHarnessConfigured())("document agreement packet security", () => {
  let admin;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
  });

  afterAll(async () => {
    if (cleanup.packetIds.size > 0) {
      await admin.from("document_packets").delete().in("id", Array.from(cleanup.packetIds));
    }
    if (cleanup.templateIds.size > 0) {
      await admin.from("document_templates").delete().in("id", Array.from(cleanup.templateIds));
    }
    if (cleanup.signatureSettingAccountIds.size > 0) {
      await admin
        .from("document_signature_provider_settings")
        .delete()
        .in("account_id", Array.from(cleanup.signatureSettingAccountIds));
    }
    if (cleanup.documentIds.size > 0) {
      await admin.from("documents").delete().in("id", Array.from(cleanup.documentIds));
    }
  });

  it("lets a manager create and send a tenant packet while keeping it recipient-scoped", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createActiveTemplate(ownerClient);
    const packet = await createTenantPacket(ownerClient, template);

    const sent = await ownerClient.rpc("send_document_packet", {
      p_packet_id: packet.id,
    });
    expect(sent.error).toBeNull();
    expect(sent.data?.status).toBe("sent");

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantRead = await tenantClient
      .from("document_packets")
      .select("id, account_id, target_role, tenant_id, status")
      .eq("id", packet.id)
      .single();
    expect(tenantRead.error).toBeNull();
    expect(tenantRead.data).toMatchObject({
      id: packet.id,
      target_role: "tenant",
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      status: "sent",
    });

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorRead = await contractorClient
      .from("document_packets")
      .select("id")
      .eq("id", packet.id);
    expect(contractorRead.error).toBeNull();
    expect(contractorRead.data).toHaveLength(0);

    const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
    const crossAccountRead = await ownerBClient
      .from("document_packets")
      .select("id")
      .eq("id", packet.id);
    expect(crossAccountRead.error).toBeNull();
    expect(crossAccountRead.data).toHaveLength(0);
  });

  it("lets the recipient view and complete a packet but blocks non-recipient actions", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createActiveTemplate(ownerClient, "Completion AST template");
    const packet = await createTenantPacket(ownerClient, template, "Tenant completion packet");

    const tenantEarlyComplete = await (await signInAsFixtureUser("tenantA1")).client.rpc("complete_document_packet", {
      p_packet_id: packet.id,
    });
    expectDenied(tenantEarlyComplete);

    await ownerClient.rpc("send_document_packet", { p_packet_id: packet.id });

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const viewed = await tenantClient.rpc("mark_document_packet_viewed", {
      p_packet_id: packet.id,
    });
    expect(viewed.error).toBeNull();
    expect(viewed.data?.status).toBe("viewed");

    const completed = await tenantClient.rpc("complete_document_packet", {
      p_packet_id: packet.id,
    });
    expect(completed.error).toBeNull();
    expect(completed.data?.status).toBe("completed");

    const tenantVoid = await tenantClient.rpc("void_document_packet", {
      p_packet_id: packet.id,
    });
    expectDenied(tenantVoid);
  });

  it("supports contractor packets without exposing them to tenants", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createActiveTemplate(ownerClient, "Contractor terms template");
    const packet = await createContractorPacket(ownerClient, template);

    await ownerClient.rpc("send_document_packet", { p_packet_id: packet.id });

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorRead = await contractorClient
      .from("document_packets")
      .select("id, target_role, contractor_id, status")
      .eq("id", packet.id)
      .single();
    expect(contractorRead.error).toBeNull();
    expect(contractorRead.data).toMatchObject({
      id: packet.id,
      target_role: "contractor",
      contractor_id: isolationFixtures.users.contractorA1.contractorId,
      status: "sent",
    });

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantRead = await tenantClient
      .from("document_packets")
      .select("id")
      .eq("id", packet.id);
    expect(tenantRead.error).toBeNull();
    expect(tenantRead.data).toHaveLength(0);
  });

  it("keeps signature readiness manager-scoped and service-role synced", async () => {
    await admin
      .from("document_signature_provider_settings")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createActiveTemplate(ownerClient, "Signature readiness template");
    const packet = await createTenantPacket(ownerClient, template, "Signature readiness packet");

    const notConfigured = await ownerClient.rpc("prepare_document_packet_signature", {
      p_packet_id: packet.id,
      p_signature_provider: null,
      p_signature_template_id: null,
    });
    expectDenied(notConfigured);

    const settings = await ownerClient.rpc("upsert_document_signature_provider_settings", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_provider: "docuseal",
      p_provider_base_url: "https://api.example.test",
      p_default_signature_template_id: "520424",
      p_is_enabled: true,
      p_webhook_configured: false,
    });
    expect(settings.error).toBeNull();
    expect(settings.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      provider: "docuseal",
      is_enabled: true,
    });
    cleanup.signatureSettingAccountIds.add(isolationFixtures.accounts.accountA.id);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantSettingsRead = await tenantClient
      .from("document_signature_provider_settings")
      .select("account_id")
      .eq("account_id", isolationFixtures.accounts.accountA.id);
    expect(tenantSettingsRead.error).toBeNull();
    expect(tenantSettingsRead.data).toHaveLength(0);

    const tenantPrepare = await tenantClient.rpc("prepare_document_packet_signature", {
      p_packet_id: packet.id,
      p_signature_provider: "docuseal",
      p_signature_template_id: "520424",
    });
    expectDenied(tenantPrepare);

    const prepared = await ownerClient.rpc("prepare_document_packet_signature", {
      p_packet_id: packet.id,
      p_signature_provider: "docuseal",
      p_signature_template_id: null,
    });
    expect(prepared.error).toBeNull();
    expect(prepared.data).toMatchObject({
      id: packet.id,
      signature_provider: "docuseal",
      signature_template_id: "520424",
      signature_status: "ready",
    });

    const submitted = await admin.rpc("record_document_packet_signature_submission", {
      p_packet_id: packet.id,
      p_provider: "docuseal",
      p_submission_id: "submission-123",
      p_signature_status: "pending",
    });
    expect(submitted.error).toBeNull();
    expect(submitted.data).toMatchObject({
      id: packet.id,
      signature_submission_id: "submission-123",
      signature_status: "pending",
    });

    const synced = await admin.rpc("sync_document_packet_signature_status", {
      p_packet_id: packet.id,
      p_submission_id: "submission-123",
      p_signature_status: "completed",
      p_completed_document_id: null,
      p_error: null,
    });
    expect(synced.error).toBeNull();
    expect(synced.data?.signature_status).toBe("completed");
  });

  it("blocks manual completion once a packet is sent to the signature provider", async () => {
    await admin
      .from("document_signature_provider_settings")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createActiveTemplate(ownerClient, "Signature lock template");
    const packet = await createTenantPacket(ownerClient, template, "Signature lock packet");

    const settings = await ownerClient.rpc("upsert_document_signature_provider_settings", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_provider: "docuseal",
      p_provider_base_url: "https://api.example.test",
      p_default_signature_template_id: "520425",
      p_is_enabled: true,
      p_webhook_configured: true,
    });
    expect(settings.error).toBeNull();
    cleanup.signatureSettingAccountIds.add(isolationFixtures.accounts.accountA.id);

    const prepared = await ownerClient.rpc("prepare_document_packet_signature", {
      p_packet_id: packet.id,
      p_signature_provider: "docuseal",
      p_signature_template_id: null,
    });
    expect(prepared.error).toBeNull();

    const submitted = await admin.rpc("record_document_packet_signature_submission", {
      p_packet_id: packet.id,
      p_provider: "docuseal",
      p_submission_id: "submission-lock",
      p_signature_status: "pending",
    });
    expect(submitted.error).toBeNull();

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const manualComplete = await tenantClient.rpc("complete_document_packet", {
      p_packet_id: packet.id,
    });
    expectDenied(manualComplete);
  });

  it("imports a signed document into the correct account scope before marking signature completion", async () => {
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const template = await createActiveTemplate(ownerClient, "Signature import template");
    const packet = await createTenantPacket(ownerClient, template, "Signature import packet");

    const submitted = await admin.rpc("record_document_packet_signature_submission", {
      p_packet_id: packet.id,
      p_provider: "docuseal",
      p_submission_id: "submission-import",
      p_signature_status: "pending",
    });
    expect(submitted.error).toBeNull();

    const imported = await admin.rpc("import_document_packet_signed_document", {
      p_packet_id: packet.id,
      p_storage_path: `${isolationFixtures.accounts.accountA.id}/signed/signature-import.pdf`,
      p_filename: "signed-tenancy-agreement.pdf",
      p_size_bytes: 512,
      p_mime_type: "application/pdf",
    });
    expect(imported.error).toBeNull();
    expect(imported.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      scope: "shared",
      visibility: "tenant",
      source: "signature_completed",
      review_status: "accepted",
      upload_status: "uploaded",
    });
    cleanup.documentIds.add(imported.data.id);

    const synced = await admin.rpc("sync_document_packet_signature_status", {
      p_packet_id: packet.id,
      p_submission_id: "submission-import",
      p_signature_status: "completed",
      p_completed_document_id: imported.data.id,
      p_error: null,
    });
    expect(synced.error).toBeNull();
    expect(synced.data).toMatchObject({
      signature_status: "completed",
      signature_completed_document_id: imported.data.id,
      status: "completed",
    });
  });
});
