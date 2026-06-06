import { expect, test } from "@playwright/test";

import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const DESKTOP = { width: 1440, height: 950 };
const MOBILE = { width: 390, height: 844 };

const ownerSurfaces = [
  {
    name: "dashboard",
    path: "/dashboard",
    ready: async (page) => {
      await expect(page.locator("main").getByRole("heading", { name: "Operations Hub" }).first()).toBeVisible();
    },
  },
  {
    name: "finance",
    path: "/finance",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
      await expect(page.getByText("Finance by property")).toBeVisible();
    },
  },
  {
    name: "documents",
    path: "/documents",
    ready: async (page) => {
      await expect(page.getByText("Add document").first()).toBeVisible();
      // "Document requests" lives inside a collapsed Workflows accordion; check the
      // accordion button itself, which is always visible on page load.
      await expect(page.getByText("Workflows").first()).toBeVisible();
    },
  },
];

for (const viewport of [DESKTOP, MOBILE]) {
  const label = viewport === DESKTOP ? "desktop" : "mobile";

  for (const surface of ownerSurfaces) {
    test(`${surface.name} passes release accessibility scan at ${label} width`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signInAs(page, seededUsers.ownerA);

      await page.goto(surface.path);
      await surface.ready(page);
      await expectNoBlockingAccessibilityViolations(page, `${surface.name} ${label}`);
    });
  }
}

test("contractor portal passes release accessibility scan at desktop and mobile widths", async ({ page }) => {
  await signInAs(page, seededUsers.contractorA1);

  for (const viewport of [DESKTOP, MOBILE]) {
    await page.setViewportSize(viewport);
    await page.goto("/contractor");
    await expect(page.getByRole("heading", { name: "Contractor Portal", exact: true })).toBeVisible();
    await expectNoBlockingAccessibilityViolations(page, `contractor portal ${viewport.width}px`);
  }
});

test("root telemetry passes release accessibility scan at desktop and mobile widths", async ({ page }) => {
  await signInAs(page, seededUsers.rootOwner);

  for (const viewport of [DESKTOP, MOBILE]) {
    await page.setViewportSize(viewport);
    await page.goto("/settings/root-telemetry");
    await expect(page.getByRole("heading", { name: "Root telemetry", exact: true })).toBeVisible();
    await expectNoBlockingAccessibilityViolations(page, `root telemetry ${viewport.width}px`);
  }
});
