import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { seededUsers, signInAs } from "./helpers/auth.js";

const screenshotDir = path.resolve(process.cwd(), "marketing-site/public/screenshots");

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.use({
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 1,
});

async function prepareShot(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  await page.addStyleTag({
    content: `* { caret-color: transparent !important; }`,
  });
  await page.evaluate(() => {
    /* global document, NodeFilter */
    const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue?.replace(uuidPattern, "demo-account") ?? "";
    });
  });
}

async function shot(page, fileName) {
  await prepareShot(page);
  await page.screenshot({
    path: path.join(screenshotDir, fileName),
    animations: "disabled",
  });
  console.log(`  ✓ ${fileName}`);
}

test("captures compliance suite screenshots", async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });
  await signInAs(page, seededUsers.ownerA);

  // Lease Auditor
  await page.goto("/compliance/leases");
  await expect(page.getByText("Lease Auditor").first()).toBeVisible();
  await shot(page, "lease-auditor.png");

  // Rent Shield
  await page.goto("/compliance/rent-shield");
  await expect(page.getByText("Rent Shield").first()).toBeVisible();
  await shot(page, "rent-shield.png");

  // Tax Readiness
  await page.goto("/compliance/tax");
  await expect(page.getByText("Tax Readiness").first()).toBeVisible();
  await shot(page, "tax-readiness.png");

  // Compliance suite overview (Lease Auditor with full page context)
  await page.goto("/compliance/leases");
  await expect(page.getByText("Lease Auditor").first()).toBeVisible();
  await shot(page, "compliance-suite.png");
});
