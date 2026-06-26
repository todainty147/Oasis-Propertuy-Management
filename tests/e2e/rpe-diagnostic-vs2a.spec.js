import { expect, test } from "@playwright/test";

import { seededUsers, signInAs } from "./helpers/auth.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
} from "../integration/helpers/localSupabaseHarness.js";

const ACCOUNT_A_ID = isolationFixtures.accounts.accountA.id;
const LEASE_ID = "9f7e9d2b-0000-4e1a-9000-000000000401";
const TENANT_ID = "9f7e9d2b-0000-4e1a-9000-000000000301";
const FALLBACK_PROPERTY_ID = "9f7e9d2b-0000-4e1a-9000-000000000201";
const LEASE_START = "2025-10-01";

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function chooseReusableProperty(admin, ownerAId) {
  const properties = await must(
    "load account properties",
    admin
      .from("properties")
      .select("id, address, tenant_id, status")
      .eq("account_id", ACCOUNT_A_ID)
      .limit(100),
  );
  const leases = await must(
    "load account leases",
    admin
      .from("leases")
      .select("id, property_id, status, renewal_status")
      .eq("account_id", ACCOUNT_A_ID)
      .limit(1000),
  );
  const tenants = await must(
    "load account tenants",
    admin
      .from("tenants")
      .select("id, property_id")
      .eq("account_id", ACCOUNT_A_ID)
      .is("archived_at", null)
      .limit(1000),
  );

  const activePropertyIds = new Set(
    leases
      .filter((lease) => (
        String(lease.status || "").toLowerCase() === "active" ||
        String(lease.renewal_status || "").toLowerCase() === "active"
      ))
      .map((lease) => lease.property_id),
  );
  const tenantPropertyIds = new Set(tenants.map((tenant) => tenant.property_id).filter(Boolean));
  const reusable = properties.find((property) => (
    !property.tenant_id &&
    !activePropertyIds.has(property.id) &&
    !tenantPropertyIds.has(property.id)
  ));
  if (reusable) return reusable.id;

  await must(
    "create fallback RPE diagnostic property",
    admin
      .from("properties")
      .upsert({
        id: FALLBACK_PROPERTY_ID,
        owner_id: ownerAId,
        address: "RPE_VS2A_UI_SMOKE_PROPERTY",
        city: "London",
        tenant_id: null,
        status: "Wolne",
        rent: 1200,
        size: "diagnostic",
        account_id: ACCOUNT_A_ID,
        market: "uk",
        country_subdivision: "England",
        pbsa: null,
      }, { onConflict: "id" })
      .select("id")
      .single(),
  );

  return FALLBACK_PROPERTY_ID;
}

async function seedCShapedLease() {
  const usersByKey = await ensureIsolationHarnessSeed();
  const ownerAId = usersByKey.ownerA.id;
  const rootOwnerId = usersByKey.rootOwner.id;
  const admin = getIntegrationAdminClient();
  const propertyId = await chooseReusableProperty(admin, ownerAId);

  await must(
    "delete previous RPE UI smoke evaluations",
    admin.from("rule_evaluation").delete().eq("tenancy_id", LEASE_ID),
  );
  await must(
    "delete previous RPE UI smoke lease",
    admin.from("leases").delete().eq("id", LEASE_ID),
  );
  await must(
    "delete previous RPE UI smoke tenant",
    admin.from("tenants").delete().eq("id", TENANT_ID),
  );

  await must(
    "prepare property jurisdiction",
    admin
      .from("properties")
      .update({
        country_subdivision: "England",
        pbsa: null,
      })
      .eq("id", propertyId)
      .eq("account_id", ACCOUNT_A_ID),
  );
  await must(
    "create RPE UI smoke tenant",
    admin
      .from("tenants")
      .insert({
        id: TENANT_ID,
        owner_id: ownerAId,
        property_id: propertyId,
        name: "RPE VS2A UI Smoke Tenant",
        email: "rpe-vs2a-ui-smoke@example.test",
        account_id: ACCOUNT_A_ID,
        status: "active",
      }),
  );
  await must(
    "create C-shaped RPE UI smoke lease",
    admin
      .from("leases")
      .insert({
        id: LEASE_ID,
        account_id: ACCOUNT_A_ID,
        property_id: propertyId,
        tenant_id: TENANT_ID,
        status: "active",
        start_date: LEASE_START,
        end_date: null,
        rent_amount: 1200,
        rent_frequency: "monthly",
        created_by: ownerAId,
        lease_start_date: LEASE_START,
        lease_end_date: null,
        renewal_status: "active",
        notice_period_days: 30,
        auto_renew: false,
        notes: "RPE VS2A UI smoke C-shaped lease",
        term_type: null,
        term_type_effective_from: null,
        term_type_evidence_basis: null,
        company_let: null,
        resident_landlord: null,
        rent_act_1977: null,
        is_wholly_oral: null,
        tenancy_class: null,
      }),
  );

  return { admin, rootOwnerId };
}

test("RPE diagnostic page captures active-on-date term indicator and records a fresh evaluation", async ({ page }) => {
  const { admin, rootOwnerId } = await seedCShapedLease();
  const evidenceBasis = `statutory_conversion_ui_smoke_${Date.now()}`;

  await signInAs(page, seededUsers.rootOwner);
  const accountSwitcher = page.getByLabel("Account").first();
  await expect(accountSwitcher).toBeVisible();
  await accountSwitcher.selectOption(ACCOUNT_A_ID);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("activeAccountId"))).toBe(ACCOUNT_A_ID);

  await page.goto("/compliance/renters-rights/rpe-diagnostic");

  await expect(page.getByRole("heading", { name: "RPE manual diagnostic" })).toBeVisible();

  const leaseSelect = page.getByLabel("Tenancy / lease");
  await expect(leaseSelect.locator(`option[value="${LEASE_ID}"]`)).toHaveCount(1);
  await leaseSelect.selectOption(LEASE_ID);

  await page.getByRole("button", { name: "Preview evaluation" }).click();
  await expect(page.getByTestId("rpe-evaluation-missing-fields")).toHaveText("active_on_qualifying_date");
  await expect(page.getByTestId("rpe-evaluation-aod-branch")).toHaveText("missing");
  await expect(page.getByTestId("rpe-recorded-evaluation-id")).toHaveText("not recorded");

  const termSection = page.locator("section").filter({ hasText: "2. Active-on-date term indicator" });
  await termSection.getByLabel("Term type").selectOption("periodic");
  await page.getByTestId("rpe-term-effective-from").fill("2026-05-01");
  await page.getByTestId("rpe-term-evidence-basis").fill(evidenceBasis);
  await page.getByTestId("rpe-capture-term-submit").click();

  await expect(page.getByTestId("rpe-evaluation-aod-branch")).toHaveText("time_qualified_periodic_indicator");
  await expect(page.getByTestId("rpe-evaluation-missing-fields")).toHaveText("tenancy_class");
  await expect(page.getByTestId("rpe-recorded-evaluation-id")).not.toHaveText("not recorded");
  await expect(page.getByTestId("rpe-capture-next-action")).toHaveText("capture_tier4_classification");

  const leaseRows = await must(
    "verify stored term indicator",
    admin
      .from("leases")
      .select("term_type, term_type_effective_from, term_type_evidence_basis")
      .eq("id", LEASE_ID)
      .single(),
  );
  expect(leaseRows).toEqual({
    term_type: "periodic",
    term_type_effective_from: "2026-05-01",
    term_type_evidence_basis: evidenceBasis,
  });

  const events = await must(
    "verify term indicator provenance event",
    admin
      .from("provenance_events")
      .select("event_type, metadata")
      .eq("account_id", ACCOUNT_A_ID)
      .eq("entity_id", LEASE_ID)
      .eq("event_type", "rpe.capture.term_indicator_confirmed"),
  );
  const freshEvent = events.find((event) => event.metadata?.evidence_basis === evidenceBasis);
  expect(freshEvent).toBeTruthy();
  expect(freshEvent.metadata).toMatchObject({
    captured_by: rootOwnerId,
    evidence_basis: evidenceBasis,
    capture_source: "manual_rpe_capture",
    demo_mode: true,
  });
});
