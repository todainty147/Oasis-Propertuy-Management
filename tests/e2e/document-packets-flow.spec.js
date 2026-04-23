import { expect, test } from "@playwright/test";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const cleanup = {
  packetIds: new Set(),
  templateIds: new Set(),
};

async function packetPanel(page) {
  const panel = page.getByTestId("document-packets-panel");
  await expect(panel).toBeVisible();
  return panel;
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
}

async function completeTenantPacket(page, packetTitle) {
  await page.goto("/tenant/documents");
  const panel = await packetPanel(page);
  const row = panel.getByTestId("document-packet-card").filter({ hasText: packetTitle });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Sent");
  await row.getByRole("button", { name: "Mark viewed" }).click();
  await expect(row).toContainText("Viewed");
  await row.getByRole("button", { name: "Complete" }).click();
  await expect(row).toContainText("Completed");
}

test("agreement packets move from active template to tenant completion", async ({ page }) => {
  const stamp = Date.now();
  const templateName = `AST browser template ${stamp}`;
  const packetTitle = `Tenant agreement packet ${stamp}`;
  await seedActiveTemplate(templateName);

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/documents");
  await createAndSendTenantPacket(page, templateName, packetTitle);

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, seededUsers.tenantA1);
  await completeTenantPacket(page, packetTitle);

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, seededUsers.ownerA);
  await page.goto("/documents");
  const panel = await packetPanel(page);
  const row = panel.getByTestId("document-packet-card").filter({ hasText: packetTitle });
  await expect(row).toContainText("Completed");
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
});
