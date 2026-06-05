import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";

const QUARTERLY_DRAFTS = "src/components/compliance/QuarterlyDraftsTab.jsx";
const TAX_TOOLS_PAGE = "src/pages/compliance/TaxToolsPage.jsx";
const LIVE_PILOT_FUNCTION = "supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts";
const LIVE_PILOT_HELPER = "supabase/functions/_shared/hmrcLiveSubmissionPilot.ts";
const READINESS_GATE = "src/lib/mtd/hmrcPhase5ReadinessGate.js";

function read(path) {
  return readFileSync(path, "utf8");
}

test.describe("HMRC Phase 5D pilot guardrails", () => {
  test("landlord cannot see an enabled live HMRC submit button", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/compliance/tax-tools");

    await expect(page.getByRole("heading", { name: "Tax Tools" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Quarterly Drafts" }).click();

    await expect(page.getByRole("button", { name: /submit to live hmrc/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /submit.*live.*hmrc/i })).toHaveCount(0);
  });

  test("quarterly draft pilot copy keeps live submission out of self-service", async () => {
    const component = read(QUARTERLY_DRAFTS);

    expect(component).toContain("Live HMRC submission pilot");
    expect(component).toContain("Live submission is not self-service");
    expect(component).toContain("Pilot submission, when approved, is completed by the Tenaqo pilot process.");
    expect(component).toContain("it cannot send a live quarterly update");
  });

  test("dry-run button is gated by dry-run feature and eligibility", async () => {
    const component = read(QUARTERLY_DRAFTS);

    expect(component).toContain("liveDryRunFeatureEnabled");
    expect(component).toContain("livePilotReadiness.allowed");
    expect(component).toContain("livePilotConsentValid");
    expect(component).toMatch(/const canRunLiveDryRun = Boolean\([\s\S]*livePilotStatus !== null[\s\S]*livePilotReadiness\.allowed[\s\S]*livePilotConsentValid[\s\S]*liveDryRunFeatureEnabled[\s\S]*\)/);
    expect(component).toMatch(/disabled=\{busy \|\| !canRunLiveDryRun\}/);
  });

  test("dry-run success copy says no data was sent to HMRC", async () => {
    const component = read(QUARTERLY_DRAFTS);
    const edgeFunction = read(LIVE_PILOT_FUNCTION);

    expect(component).toContain("Live submission dry run passed. No data was sent to HMRC.");
    expect(edgeFunction).toContain("Live submission dry run passed. No data was sent to HMRC.");
    expect(edgeFunction).toContain("Live submission dry run validation failed. No data was sent to HMRC.");
  });

  test("tenant and contractor cannot access Tax Tools or HMRC pilot surfaces", async ({ page }) => {
    for (const email of [seededUsers.tenantA1, seededUsers.contractorA1]) {
      await signInAs(page, email);

      await page.goto("/compliance/tax-tools");
      await expect(page).not.toHaveURL(/\/compliance\/tax-tools(?:\?.*)?$/);
      await expect(page.getByRole("heading", { name: "Tax Tools" })).toHaveCount(0);
      await expect(page.getByText("Live HMRC submission pilot")).toHaveCount(0);

      await page.goto("/compliance/hmrc-connection");
      await expect(page).not.toHaveURL(/\/compliance\/hmrc-connection(?:\?.*)?$/);
      await expect(page.getByText("Live HMRC submission pilot")).toHaveCount(0);
    }
  });

  test("root/operator pilot action requires an allowlisted account and root operator", async () => {
    const edgeFunction = read(LIVE_PILOT_FUNCTION);
    const pilotHelper = read(LIVE_PILOT_HELPER);
    const taxToolsPage = read(TAX_TOOLS_PAGE);

    expect(edgeFunction).toContain("Only a Tenaqo root operator can trigger the one-account live network pilot.");
    expect(edgeFunction).toContain("assertPhase5DLivePilotEvidence");
    expect(pilotHelper).toContain("account_not_allowlisted");
    expect(taxToolsPage).toContain("allowlisted: false");
  });

  test("operator live network action requires typed LIVE PILOT confirmation", async () => {
    const edgeFunction = read(LIVE_PILOT_FUNCTION);

    expect(edgeFunction).toContain("typedConfirmation");
    expect(edgeFunction).toContain("LIVE PILOT");
    expect(edgeFunction).toContain("confirmLiveNetworkSubmission");
  });

  test("pilot UI avoids overclaiming copy", async () => {
    const surfaces = [
      read(QUARTERLY_DRAFTS),
      read(TAX_TOOLS_PAGE),
      read(LIVE_PILOT_FUNCTION),
    ].join("\n");

    expect(surfaces).not.toMatch(/fully MTD compliant/i);
    expect(surfaces).not.toMatch(/tax return submitted/i);
    expect(surfaces).not.toMatch(/final declaration complete/i);
    expect(surfaces).not.toMatch(/HMRC recognised/i);
  });

  test("general live submission readiness remains false", async () => {
    const gate = read(READINESS_GATE);

    expect(gate).toContain("READY_FOR_GENERAL_LIVE_SUBMISSION: false");
    expect(gate).toContain("READY_FOR_LIVE_SUBMISSION: false");
    expect(gate).not.toMatch(/READY_FOR_GENERAL_LIVE_SUBMISSION:\s*true/);
    expect(gate).not.toMatch(/READY_FOR_LIVE_SUBMISSION:\s*true/);
  });
});
