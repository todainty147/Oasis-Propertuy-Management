import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { logout, seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

const screenshotDir = path.resolve(process.cwd(), "marketing-site/public/screenshots");
const propertyDetailPath = `/properties/${seededEntityIds.propertyA}`;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.use({
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 1,
});

async function prepareMarketingShot(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);

  await page.addStyleTag({
    content: `
      * { caret-color: transparent !important; }
      .fixed, .sticky { scroll-margin-top: 0 !important; }
    `,
  });

  await page.evaluate(() => {
    /* global document, NodeFilter */
    const uuidPattern =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue?.replace(uuidPattern, "demo-account") ?? "";
    });
  });
}

async function captureViewport(page, fileName) {
  await prepareMarketingShot(page);
  await page.screenshot({
    path: path.join(screenshotDir, fileName),
    animations: "disabled",
  });
}

async function seedActiveTemplate(name) {
  const admin = getIntegrationAdminClient();
  const { error } = await admin.from("document_templates").insert({
    account_id: isolationFixtures.accounts.accountA.id,
    country_code: "GB",
    language: "en",
    template_type: "tenancy_agreement",
    name,
    description: "Marketing site screenshot template.",
    storage_path: `${isolationFixtures.accounts.accountA.id}/templates/marketing-${Date.now()}/${name}.pdf`,
    mime_type: "application/pdf",
    size_bytes: 64,
    status: "active",
    upload_status: "uploaded",
  });

  expect(error).toBeNull();
}

test("captures marketing product screenshots", async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });
  const stamp = Date.now();
  const templateName = `Marketing agreement template ${stamp}`;
  const packetTitle = `Marketing agreement packet ${stamp}`;
  const requestTitle = `Payment receipt request ${stamp}`;

  await seedActiveTemplate(templateName);
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/command-center");
  await expect(page.getByText("Command Center").first()).toBeVisible();
  await captureViewport(page, "command-center.png");

  await page.goto("/portfolio-health");
  await expect(page.getByText("Portfolio Health").first()).toBeVisible();
  await captureViewport(page, "portfolio-health.png");

  await page.goto("/maintenance-inbox");
  await expect(page.getByText("Maintenance Inbox").first()).toBeVisible();
  await captureViewport(page, "maintenance-inbox.png");

  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
  await page.getByLabel("Collection method").selectOption("external_portal");
  await page.getByLabel("Bank transfer").check();
  await page.getByLabel("Card via external portal").check();
  await page.getByLabel("External payment portal URL").fill("https://payments.example.test/pay");
  await page.getByLabel("Tenant instructions").fill("Use your tenancy reference for bank transfer or open the external portal for card payments.");
  await page.getByLabel("Billing / support email").fill("billing@example.test");
  await page.getByLabel("Autopay availability").selectOption("external");
  await page.getByLabel("Autopay instructions").fill("Contact the property team to set up a standing order outside Tenaqo.");
  await page.getByRole("button", { name: "Save payment setup" }).click();
  await expect(page.getByText("Tenant payment settings saved.")).toBeVisible();
  await captureViewport(page, "payment-setup.png");

  await page.goto("/documents");
  await expect(page.getByText("Documents").first()).toBeVisible();
  const requestPanel = page.getByTestId("document-requests-panel");
  await expect(requestPanel).toBeVisible();
  await requestPanel.getByLabel("Request tenant").selectOption(isolationFixtures.users.tenantA1.tenantId);
  await requestPanel.getByLabel("Request type").selectOption("bank_payment_receipt");
  await requestPanel.getByPlaceholder("Request title, e.g. Proof of ID").fill(requestTitle);
  await requestPanel.getByPlaceholder("Instructions shown to the recipient").fill("Upload a receipt after payment.");
  await requestPanel.getByRole("button", { name: "Create request" }).click();
  await expect(requestPanel).toContainText(requestTitle);

  const packetPanel = page.getByTestId("document-packets-panel");
  await expect(packetPanel).toBeVisible();
  await packetPanel.getByRole("button", { name: "Refresh" }).click();
  await packetPanel.getByLabel("Template").selectOption({ label: templateName });
  await packetPanel.getByLabel("Packet tenant").selectOption(isolationFixtures.users.tenantA1.tenantId);
  await packetPanel.getByLabel("Packet type").selectOption("agreement");
  await packetPanel.getByPlaceholder("Packet title, e.g. Tenancy agreement 2026").fill(packetTitle);
  await packetPanel.getByPlaceholder("Message shown to the recipient").fill("Please review this agreement packet.");
  await packetPanel.getByRole("button", { name: "Create packet" }).click();
  const packetRow = packetPanel.getByTestId("document-packet-card").filter({ hasText: packetTitle });
  await expect(packetRow).toBeVisible();
  await packetRow.getByRole("button", { name: "Send" }).click();
  await expect(packetRow).toContainText("Sent");
  await captureViewport(page, "documents-workflow.png");

  await page.goto("/settings/security-audit");
  await expect(page.getByText("Security Audit").first()).toBeVisible();
  await captureViewport(page, "security-audit.png");

  // ── Compliance Suite ─────────────────────────────────────────────────────

  await page.goto("/compliance/leases");
  await expect(page.getByText("Lease Auditor").first()).toBeVisible();
  await captureViewport(page, "lease-auditor.png");

  await page.goto("/compliance/rent-shield");
  await expect(page.getByText("Rent Shield").first()).toBeVisible();
  await captureViewport(page, "rent-shield.png");

  await page.goto("/compliance/tax");
  await expect(page.getByText("Tax Readiness").first()).toBeVisible();
  await captureViewport(page, "tax-readiness.png");

  // Combined overview: scroll Lease Auditor to show the full suite context
  await page.goto("/compliance/leases");
  await expect(page.getByText("Lease Auditor").first()).toBeVisible();
  await captureViewport(page, "compliance-suite.png");

  await page.goto(propertyDetailPath);
  await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible();
  await expect(page.getByText("Property performance")).toBeVisible();
  await captureViewport(page, "property-performance.png");

  await page.getByText("Issues / Requests").scrollIntoViewIfNeeded();
  await expect(page.getByText("Issues / Requests")).toBeVisible();
  await captureViewport(page, "property-requests.png");

  await logout(page);
  await signInAs(page, seededUsers.tenantA1);

  await page.goto("/tenant/home");
  await expect(page.getByRole("heading", { name: "Your tenancy space" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your home overview" })).toBeVisible();
  await captureViewport(page, "tenant-home.png");

  await page.goto("/tenant/documents");
  await expect(page.getByTestId("document-packets-panel")).toBeVisible();
  await expect(page.getByText(packetTitle)).toBeVisible();
  await captureViewport(page, "tenant-documents.png");
});
