import { expect, test } from "@playwright/test";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { logout, seededUsers, signInAs } from "./helpers/auth.js";

const cleanup = {
  packetIds: new Set(),
  templateIds: new Set(),
  signatureSettingAccountIds: new Set(),
};

async function openWorkflows(page) {
  const panel = page.getByTestId("document-packets-panel");
  if (await panel.isVisible().catch(() => false)) return;
  try {
    await expect(panel).toBeVisible({ timeout: 3_000 });
    return;
  } catch {
    // Manager workflows are accordion-wrapped; tenant packet panels are direct.
  }
  const button = page.getByRole("button", { name: /Workflows|Przepływy/i }).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
}

async function packetPanel(page) {
  await openWorkflows(page);
  const panel = page.getByTestId("document-packets-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function configureSignatureReadiness(stamp) {
  const admin = getIntegrationAdminClient();
  const templateId = String(520000 + Number(String(stamp).slice(-4)));
  const { error } = await admin.from("document_signature_provider_settings").upsert({
    account_id: isolationFixtures.accounts.accountA.id,
    provider: "docuseal",
    provider_base_url: "https://api.example.test",
    default_signature_template_id: templateId,
    is_enabled: true,
    webhook_configured: true,
  });

  expect(error).toBeNull();
  cleanup.signatureSettingAccountIds.add(isolationFixtures.accounts.accountA.id);
}

async function seedActiveTemplate(name) {
  const admin = getIntegrationAdminClient();
  const { data, error } = await admin
    .from("document_templates")
    .insert({
      account_id: isolationFixtures.accounts.accountA.id,
      country_code: "GB",
      language: "en",
      template_type: "tenancy_agreement",
      name,
      description: "Browser packet workflow template.",
      storage_path: `${isolationFixtures.accounts.accountA.id}/templates/browser-${Date.now()}/${name}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 32,
      status: "active",
      upload_status: "uploaded",
    })
    .select("id")
    .single();

  expect(error).toBeNull();
  cleanup.templateIds.add(data.id);
}

async function createAndSendTenantPacket(page, templateName, packetTitle) {
  const panel = await packetPanel(page);
  await panel.getByRole("button", { name: "Refresh" }).click();
  await panel.getByLabel("Template").selectOption({ label: templateName });
  await panel.getByLabel("Target role").selectOption("tenant");
  await panel.getByLabel("Packet tenant").selectOption(isolationFixtures.users.tenantA1.tenantId);
  await panel.getByLabel("Packet type").selectOption("agreement");
  await panel.getByPlaceholder("Packet title, e.g. Tenancy agreement 2026").fill(packetTitle);
  await panel.getByPlaceholder("Message shown to the recipient").fill("Please review this agreement packet.");
  await panel.getByRole("button", { name: "Create packet" }).click();

  const row = panel.getByTestId("document-packet-card").filter({ hasText: packetTitle });
  await expect(row).toBeVisible();
  const packetId = await row.getAttribute("data-packet-id");
  if (packetId) cleanup.packetIds.add(packetId);
  await expect(row).toContainText("Draft");
  await row.getByRole("button", { name: "Send" }).click();
  await expect(row).toContainText("Sent");
  await row.getByRole("button", { name: "Prepare signature" }).click();
  await expect(row).toContainText("Ready to send");
  await row.getByRole("button", { name: "Send for signature" }).click();
  await expect(row).toContainText("Awaiting signature");
}

async function completeTenantPacket(page, packetTitle) {
  await page.goto("/tenant/documents");
  await expect(page.getByRole("heading", { name: "Review packets" })).toBeVisible({ timeout: 15_000 });
  const row = page.getByTestId("document-packet-card").filter({ hasText: packetTitle });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Sent");
  await expect(row.getByRole("link", { name: "Open signature" })).toBeVisible();
  await row.getByRole("button", { name: "Mark viewed" }).click();
  await expect(row).toContainText("Viewed");
}

test("agreement packets move from active template to tenant signature task visibility", async ({ page }) => {
  const stamp = Date.now();
  const templateName = `AST browser template ${stamp}`;
  const packetTitle = `Tenant agreement packet ${stamp}`;
  await seedActiveTemplate(templateName);

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/documents");
  await configureSignatureReadiness(stamp);
  await createAndSendTenantPacket(page, templateName, packetTitle);

  await logout(page);
  await signInAs(page, seededUsers.tenantA1);
  await completeTenantPacket(page, packetTitle);
});

test.afterEach(async () => {
  const admin = getIntegrationAdminClient();
  if (cleanup.packetIds.size > 0) {
    await admin.from("document_packets").delete().in("id", Array.from(cleanup.packetIds));
    cleanup.packetIds.clear();
  }
  if (cleanup.templateIds.size > 0) {
    await admin.from("document_templates").delete().in("id", Array.from(cleanup.templateIds));
    cleanup.templateIds.clear();
  }
  if (cleanup.signatureSettingAccountIds.size > 0) {
    await admin
      .from("document_signature_provider_settings")
      .delete()
      .in("account_id", Array.from(cleanup.signatureSettingAccountIds));
    cleanup.signatureSettingAccountIds.clear();
  }
});
