import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { seededUsers, signInAs } from "./helpers/auth.js";

const screenshotDir = path.resolve(process.cwd(), "marketing-site/public/screenshots/linkedin");

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.use({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});

async function prepareShot(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);

  await page.addStyleTag({
    content: `
      * { caret-color: transparent !important; }
      html { scroll-behavior: auto !important; }
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
  await prepareShot(page);
  await page.screenshot({
    path: path.join(screenshotDir, fileName),
    animations: "disabled",
  });
}

async function captureLocator(page, locator, fileName) {
  await prepareShot(page);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await locator.screenshot({
    path: path.join(screenshotDir, fileName),
    animations: "disabled",
  });
}

test("captures linkedin-ready product shots for operator storytelling", async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });
  await signInAs(page, seededUsers.ownerA);

  await page.goto("/command-center");
  await expect(page.getByText("Command Center").first()).toBeVisible();
  const briefingCard = page.getByTestId("attention-insight-card");
  await expect(briefingCard).toBeVisible({ timeout: 30000 });
  await captureViewport(page, "command-center-story.png");
  await captureLocator(page, briefingCard, "command-center-operator-briefing-card.png");

  await page.goto("/portfolio-health");
  await expect(page.getByText("Portfolio Health").first()).toBeVisible();
  const healthCard = page.getByTestId("property-health-ai-card");
  await expect(healthCard).toBeVisible({ timeout: 30000 });
  await captureViewport(page, "portfolio-health-story.png");
  await captureLocator(page, healthCard, "portfolio-health-explainer-card.png");

  await page.goto("/maintenance-inbox");
  await expect(page.getByText("Maintenance Inbox").first()).toBeVisible();
  const triageCard = page.locator('[data-testid^="maintenance-triage-card-"]').first();
  await expect(triageCard).toBeVisible({ timeout: 30000 });
  const factsToggle = triageCard.getByRole("button", { name: /Show facts|Pokaż fakty/i });
  if (await factsToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await factsToggle.click();
    await expect(triageCard.getByText(/Facts used|Fakty użyte/i)).toBeVisible({ timeout: 15000 });
  }
  const draftsToggle = triageCard.getByRole("button", { name: /Show drafts|Pokaż szkice/i });
  if (await draftsToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await draftsToggle.click();
  }
  await captureViewport(page, "maintenance-inbox-story.png");
  await captureLocator(page, triageCard, "maintenance-inbox-triage-card.png");
});
