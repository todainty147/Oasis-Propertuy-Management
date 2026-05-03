import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

test.setTimeout(90000);

function pdfFile(name, label) {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n${label}\n%%EOF`),
  };
}

async function requestPanel(page) {
  const panel = page.getByTestId("document-requests-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function waitForRequestsReady(panel) {
  await expect(panel.getByText("Loading...")).toHaveCount(0, { timeout: 20000 });
}

async function createTenantRequest(page, title) {
  await page.goto("/documents");
  const panel = await requestPanel(page);
  await expect(panel.getByRole("heading", { name: "Document requests" })).toBeVisible();
  await waitForRequestsReady(panel);

  await panel.getByLabel("Target role").selectOption("tenant");
  await panel.getByLabel("Request tenant").selectOption(isolationFixtures.users.tenantA1.tenantId);
  await panel.getByLabel("Request type").selectOption("id_document");
  await panel.getByPlaceholder("Request title, e.g. Proof of ID").fill(title);
  await panel.getByPlaceholder("Instructions shown to the recipient").fill("Upload a clear test ID document.");
  await panel.getByRole("button", { name: "Create request" }).click();

  await expect(panel.getByText(title)).toBeVisible();
}

async function createContractorRequest(page, title) {
  await page.goto("/documents");
  const panel = await requestPanel(page);
  await waitForRequestsReady(panel);

  await panel.getByLabel("Target role").selectOption("contractor");
  await panel.getByLabel("Request contractor").selectOption(isolationFixtures.users.contractorA1.contractorId);
  await panel.getByLabel("Request type").selectOption("insurance_certificate");
  await panel.getByPlaceholder("Request title, e.g. Proof of ID").fill(title);
  await panel.getByPlaceholder("Instructions shown to the recipient").fill("Upload current insurance.");
  await panel.getByRole("button", { name: "Create request" }).click();

  await expect(panel.getByText(title)).toBeVisible();
}

async function uploadForVisibleRequest(page, title, file) {
  const panel = await requestPanel(page);
  await waitForRequestsReady(panel);
  const row = panel.getByTestId("document-request-card").filter({ hasText: title });
  await expect(row).toBeVisible();

  const chooserPromise = page.waitForEvent("filechooser");
  await row.getByRole("button", { name: "Upload document" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);

  await expect(row).toContainText(file.name);
  await expect(row).toContainText("Pending review");
}

async function acceptVisibleRequest(page, title, fileName) {
  await page.goto("/documents");
  const panel = await requestPanel(page);
  const row = panel.getByTestId("document-request-card").filter({ hasText: title });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForRequestsReady(panel);
    if (await row.isVisible().catch(() => false)) {
      const rowText = await row.textContent().catch(() => "");
      if (String(rowText || "").includes(fileName)) {
        break;
      }
    }
    await panel.getByRole("button", { name: "Refresh" }).click();
  }

  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row).toContainText(fileName, { timeout: 20000 });
  await row.getByRole("button", { name: "Accept" }).click();
  await expect(row).toContainText("Accepted");
}

test("document requests move from manager to tenant and contractor upload review", async ({ page }) => {
  const stamp = Date.now();
  const tenantTitle = `Tenant ID evidence ${stamp}`;
  const contractorTitle = `Contractor insurance ${stamp}`;

  await signInAs(page, seededUsers.ownerA);
  await createTenantRequest(page, tenantTitle);
  await createContractorRequest(page, contractorTitle);

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, seededUsers.tenantA1);
  await page.goto("/tenant/documents");
  await uploadForVisibleRequest(page, tenantTitle, pdfFile(`tenant-id-${stamp}.pdf`, tenantTitle));

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, seededUsers.contractorA1);
  await page.goto("/contractor");
  await uploadForVisibleRequest(page, contractorTitle, pdfFile(`contractor-insurance-${stamp}.pdf`, contractorTitle));

  await page.getByRole("button", { name: "Logout" }).click();
  await signInAs(page, seededUsers.ownerA);
  await acceptVisibleRequest(page, tenantTitle, `tenant-id-${stamp}.pdf`);
  await acceptVisibleRequest(page, contractorTitle, `contractor-insurance-${stamp}.pdf`);
});
