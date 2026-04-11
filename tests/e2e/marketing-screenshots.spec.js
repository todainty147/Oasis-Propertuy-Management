import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { seededEntityIds, seededUsers, signInAs } from "./helpers/auth.js";

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

test("captures marketing product screenshots", async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });
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

  await page.goto("/settings/security-audit");
  await expect(page.getByText("Security Audit").first()).toBeVisible();
  await captureViewport(page, "security-audit.png");

  await page.goto(propertyDetailPath);
  await expect(page.getByRole("heading", { name: "11 Starlight Avenue" })).toBeVisible();
  await expect(page.getByText("Property performance")).toBeVisible();
  await captureViewport(page, "property-performance.png");

  await page.getByText("Issues / Requests").scrollIntoViewIfNeeded();
  await expect(page.getByText("Issues / Requests")).toBeVisible();
  await captureViewport(page, "property-requests.png");
});
