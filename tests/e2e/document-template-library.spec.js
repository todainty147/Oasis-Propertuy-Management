import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const cleanup = {
  templateIds: new Set(),
  templatePaths: new Set(),
};

function pdfFile(name, label) {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n${label}\n%%EOF`),
  };
}

test("template library uploads a manager template and shows it in the repository", async ({ page }) => {
  const stamp = Date.now();
  const templateName = `Contractor onboarding ${stamp}`;

  await signInAs(page, seededUsers.ownerA);
  await page.goto("/documents");

  const panel = page.getByTestId("document-template-library");
  await expect(panel).toBeVisible();

  await panel.getByLabel("Template type").selectOption("contractor_assignment");
  await panel.locator('input:not([type="file"])').first().fill(templateName);

  const chooserPromise = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Add template" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(pdfFile(`contractor-template-${stamp}.pdf`, templateName));

  const row = panel.getByText(templateName);
  await expect(row).toBeVisible();

  const admin = getIntegrationAdminClient();
  const { data, error } = await admin
    .from("document_templates")
    .select("id, storage_path")
    .eq("name", templateName)
    .single();

  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  expect(data?.storage_path).toContain("/templates/");

  cleanup.templateIds.add(data.id);
  cleanup.templatePaths.add(data.storage_path);
});

test.afterEach(async () => {
  const admin = getIntegrationAdminClient();
  if (cleanup.templatePaths.size > 0) {
    await admin.storage.from("documents").remove(Array.from(cleanup.templatePaths));
    cleanup.templatePaths.clear();
  }
  if (cleanup.templateIds.size > 0) {
    await admin.from("document_templates").delete().in("id", Array.from(cleanup.templateIds));
    cleanup.templateIds.clear();
  }
});
