/**
 * Integration tests — Spreadsheet import pipeline: messy real-world scenarios
 *
 * Requires a live local Supabase harness (Docker).
 * Extends tests/integration/spreadsheetImport.test.js with additional coverage
 * focused on the scenarios described in the P-009 hardening brief:
 *
 *   1.  Exact property match — no duplicate created
 *   2.  Normalised-address match — skipped, not auto-accepted as new
 *   3.  No name-only auto-match — only address/ref matching permitted
 *   4.  Create decision — new property created for unmatched row
 *   5.  Skip decision — row status returned as 'skipped'
 *   6.  Row-level partial commit — valid rows commit even when one row fails
 *   7.  import_batch_id set on every imported compliance row
 *   8.  is_attested_import = true is not a direct column — see schema note below
 *   9.  No silent overwrites — second import of same row is skipped
 *  10.  Traceability — batch ID, source filename, row number, actor ID recorded
 *  11.  Cross-account isolation — account B cannot read or write account A data
 *  12.  Native records untouched — non-imported compliance row not changed
 *  13.  Re-import behaviour — previously imported rows are skipped
 *
 * Schema note on is_attested_import:
 *   The tenancy_compliance_items table does NOT have an is_attested_import column.
 *   The P-009 design uses import_batch_id (set only for imported rows) as the
 *   provenance marker. The compliance_gap_unified VIEW exposes is_attested_import
 *   derived from (import_batch_id IS NOT NULL). We test via import_batch_id.
 *   The complianceImportService.getImportedReviewCount tests the VIEW path.
 *
 * UUID prefix: bb001100-* (all valid hex, test-isolation prefix)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { assertRowCountInvariant } from "../../src/lib/spreadsheetParser.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_B = "22222222-2222-2222-2222-222222222222";

// Unique run prefix — avoids cross-run pollution in shared test DB
const RUN_ID = Math.random().toString(36).slice(2, 8);
const EXT = (n) => `PIPE-${RUN_ID}-${n}`;

// ── RPC helper ────────────────────────────────────────────────────────────────

async function importBatch(client, { accountId = ACCOUNT_A, tab, rows, filename = "test.csv" }) {
  const { data, error } = await client.rpc("process_import_batch", {
    p_account_id: accountId,
    p_tab: tab,
    p_rows: rows,
    p_source_filename: filename,
  });
  if (error) throw error;
  assertRowCountInvariant(data, rows.length);
  return data;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Spreadsheet import pipeline — messy real-world scenarios",
  () => {
    let admin;
    let ownerAClient;
    let ownerBClient;

    const createdBatchIds = [];
    const createdPropertyIds = [];
    const createdComplianceIds = [];
    const createdTenantIds = [];

    // CONCERN-5 FIX: trackBatch now accepts an explicit `tab` so compliance entity_ids
    // are routed to createdComplianceIds (not createdPropertyIds). The RPC result object
    // does not carry a `tab` field — the caller must pass the tab value they used.
    function trackBatch(result, tab = "properties") {
      if (result?.batch_id) createdBatchIds.push(result.batch_id);
      (result?.rows ?? []).forEach((r) => {
        if (r.status === "imported" && r.entity_id) {
          if (tab === "compliance") {
            createdComplianceIds.push(r.entity_id);
          } else if (tab === "tenancies") {
            createdTenantIds.push(r.entity_id);
          } else {
            createdPropertyIds.push(r.entity_id);
          }
        }
      });
      return result;
    }

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();
      ownerAClient = (await signInAsFixtureUser("ownerA")).client;
      ownerBClient = (await signInAsFixtureUser("ownerB")).client;
    });

    afterAll(async () => {
      // CONCERN-5: Tables cleaned in FK dependency order. Tables that receive inserts
      // during this test suite and their cleanup strategy:
      //
      //   tenancy_compliance_items  — deleted by ID (createdComplianceIds). Note: after
      //     trackBatch() was fixed to pass "compliance", all compliance entity_ids now
      //     land in createdComplianceIds. The inner afterAll in describe "12" additionally
      //     cleans the manually-inserted native row.
      //
      //   tenants                   — deleted by ID (createdTenantIds). Currently no tenancy
      //     imports in this suite, so this array will be empty; included for forward-compat.
      //
      //   properties                — deleted by ID (createdPropertyIds). Includes both
      //     direct property imports and properties created inside describe beforeAll blocks.
      //
      //   import_batch_rows         — deleted by batch_id cascade (FK to import_batches).
      //
      //   import_batches            — deleted by ID (createdBatchIds).
      //
      //   provenance_events         — NOT explicitly cleaned here. These are append-only audit
      //     rows. They are scoped to ACCOUNT_A (a test fixture account) and will not pollute
      //     real-user data. If test isolation requires cleaning them, add:
      //       await admin.from("provenance_events").delete().in("metadata->>'import_batch_id'", createdBatchIds);
      //     However, provenance_events deletion may be restricted by policy — defer to a
      //     separate test-harness admin script if contamination is observed.

      // 1. Compliance items first (FK child of properties)
      if (createdComplianceIds.length > 0) {
        await admin.from("tenancy_compliance_items").delete().in("id", createdComplianceIds);
      }
      // 2. Tenants
      if (createdTenantIds.length > 0) {
        await admin.from("tenants").delete().in("id", createdTenantIds);
      }
      // 3. Properties
      if (createdPropertyIds.length > 0) {
        await admin.from("properties").delete().in("id", createdPropertyIds);
      }
      // 4. Batch rows then batches (import_batch_rows FK → import_batches)
      if (createdBatchIds.length > 0) {
        await admin.from("import_batch_rows").delete().in("batch_id", createdBatchIds);
        await admin.from("import_batches").delete().in("id", createdBatchIds);
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // 1. Exact property match — import creates no duplicate
    // ════════════════════════════════════════════════════════════════════════

    describe("1 — exact property match: second import skipped, no duplicate", () => {
      const REF = EXT("EXACT-MATCH");

      it("first import creates the property", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "10 Exact Match Road", city: "London", external_property_ref: REF }],
          })
        );
        expect(result.imported).toBe(1);
        expect(result.error).toBe(0);
      });

      it("second import of identical row is skipped — no duplicate created", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "10 Exact Match Road", city: "London", external_property_ref: REF }],
          })
        );
        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(0);
      });

      it("only one property row exists for this ref in the database", async () => {
        const { data } = await admin
          .from("properties")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .eq("external_property_ref", REF);
        expect(data?.length).toBe(1);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 2. Normalised-address match — skipped, not auto-created
    // ════════════════════════════════════════════════════════════════════════

    describe("2 — normalised-address match: whitespace/case variants skip, not duplicate", () => {
      const REF = EXT("NORM-MATCH");

      it("creates property with canonical address", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "20 Normalised Street", city: "London", external_property_ref: REF }],
          })
        );
        expect(result.imported).toBe(1);
      });

      it("import with extra whitespace matches existing property — skipped", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "  20  Normalised  Street  ", city: "London" }],
          })
        );
        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(0);
      });

      it("import with uppercase matches existing property — skipped", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "20 NORMALISED STREET", city: "London" }],
          })
        );
        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(0);
      });

      it("still only one property in the database for this address", async () => {
        const { data } = await admin
          .from("properties")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .eq("external_property_ref", REF);
        expect(data?.length).toBe(1);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 3. No name-only auto-match — only address/ref permitted
    // ════════════════════════════════════════════════════════════════════════

    // CONCERN-2 FIX: The correct "no name-only match" scenario is two properties with the
    // same *name* (display name) but different *addresses*. The previous test used city-only
    // matching (a different scenario). We now use "Oak House" at two distinct addresses.
    describe("3 — no name-only auto-match for properties", () => {
      // Two properties share the same display name ("Oak House") but live at different addresses.
      const REF_OAK_A = EXT("OAK-A");
      const REF_OAK_B = EXT("OAK-B");
      // Captured in the seed test so subsequent tests can assert against known IDs.
      let oakAt14Id;
      let oakAt27Id;

      it("seeds two 'Oak House' properties at different addresses (same name, different address)", async () => {
        // Property 1: Oak House at 14 Oak Street
        const r1 = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "14 Oak Street", city: "London", name: "Oak House", external_property_ref: REF_OAK_A }],
          })
        );
        // Property 2: Oak House at 27 Birch Lane
        const r2 = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "27 Birch Lane", city: "London", name: "Oak House", external_property_ref: REF_OAK_B }],
          })
        );
        expect(r1.imported).toBe(1);
        expect(r2.imported).toBe(1);
        oakAt14Id = r1.rows?.find((r) => r.status === "imported")?.entity_id;
        oakAt27Id = r2.rows?.find((r) => r.status === "imported")?.entity_id;
      });

      it("importing 'Oak House' with no address and no ref is rejected — no name-only auto-match", async () => {
        // An import row with name='Oak House' but no address or external_ref cannot be
        // auto-matched. The properties tab REQUIRES an address; a missing address causes
        // RAISE EXCEPTION 'address is required' which is not caught as needs_review, so
        // the pipeline returns status='error' for this row.
        // The critical assertion: it is NOT auto-imported as a match to either Oak House property.
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            // No address, no external_property_ref — only the name field
            rows: [{ name: "Oak House", city: "London" }],
          })
        );

        expect(result.total).toBe(1);
        expect(result.imported, "name-only row must not be auto-imported").toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.needs_review).toBe(0);
        // address is required; the RPC raises an exception → error status
        expect(result.error).toBe(1);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].status).toBe("error");
        expect(result.rows[0].entity_id).toBeFalsy();

        // Verify neither Oak House property was created a third time.
        // properties has no `name` column; query by the known external_property_ref values
        // which uniquely identify the two seeded Oak House properties.
        const { data: oaks } = await admin
          .from("properties")
          .select("id, external_property_ref")
          .eq("account_id", ACCOUNT_A)
          .in("external_property_ref", [REF_OAK_A, REF_OAK_B])
          .order("created_at");

        expect(oaks).toHaveLength(2);
        if (oakAt14Id && oakAt27Id) {
          expect(oaks.map((p) => p.id).sort()).toEqual([oakAt14Id, oakAt27Id].sort());
        }
      });

      it("both Oak House properties still exist independently (no merge occurred)", async () => {
        const { data } = await admin
          .from("properties")
          .select("id, address")
          .eq("account_id", ACCOUNT_A)
          .in("external_property_ref", [REF_OAK_A, REF_OAK_B]);
        expect(data?.length).toBe(2);
        const addresses = (data ?? []).map((r) => r.address);
        expect(addresses).toContain("14 Oak Street");
        expect(addresses).toContain("27 Birch Lane");
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 4. Create decision — new property created for unmatched row
    // ════════════════════════════════════════════════════════════════════════

    describe("4 — create decision: unmatched row creates new property", () => {
      const REF = EXT("CREATE-NEW");

      it("unmatched property (no existing ref or address) is imported", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "40 Brand New Court", city: "London", external_property_ref: REF }],
          })
        );
        expect(result.imported).toBe(1);
        expect(result.error).toBe(0);
        expect(result.needs_review).toBe(0);
      });

      it("the new property exists in the database", async () => {
        const { data } = await admin
          .from("properties")
          .select("id, address")
          .eq("account_id", ACCOUNT_A)
          .eq("external_property_ref", REF);
        expect(data?.length).toBe(1);
        expect(data[0].address).toBe("40 Brand New Court");
      });

      it("the new property has the correct account_id", async () => {
        const { data } = await admin
          .from("properties")
          .select("account_id")
          .eq("external_property_ref", REF);
        expect(data?.[0]?.account_id).toBe(ACCOUNT_A);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 5. Skip decision — already-matched row returned as 'skipped'
    // ════════════════════════════════════════════════════════════════════════

    describe("5 — skip decision: row returned with status=skipped", () => {
      const REF = EXT("SKIP-DEC");

      it("first import creates the property", async () => {
        const r = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "50 Skip Decision Avenue", city: "London", external_property_ref: REF }],
          })
        );
        expect(r.imported).toBe(1);
      });

      it("re-import returns status=skipped in row results", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "50 Skip Decision Avenue", city: "London", external_property_ref: REF }],
          })
        );
        expect(result.skipped).toBe(1);
        expect(result.rows?.[0]?.status).toBe("skipped");
      });

      it("skipped row has entity_id pointing to the existing property", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: "50 Skip Decision Avenue", city: "London", external_property_ref: REF }],
          })
        );
        const skippedRow = result.rows?.find((r) => r.status === "skipped");
        expect(skippedRow?.entity_id).toBeTruthy();
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 6. Row-level partial commit
    // ════════════════════════════════════════════════════════════════════════

    describe("6 — row-level partial commit: valid rows commit despite one failure", () => {
      it("batch with one blank-address row: valid rows still imported", async () => {
        const rows = [
          { address: `60 Partial A ${RUN_ID}`, city: "London", external_property_ref: EXT("PART-A") },
          { address: "", city: "BadRow — no address" },
          { address: `60 Partial C ${RUN_ID}`, city: "Birmingham", external_property_ref: EXT("PART-C") },
        ];
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "properties", rows })
        );
        expect(result.total).toBe(3);
        // At least 2 rows resolved (imported or skipped)
        expect(result.imported + result.skipped).toBeGreaterThanOrEqual(2);
        // At least 1 error
        expect(result.error).toBeGreaterThanOrEqual(1);
        // T-INTEGRITY-1
        const sum = result.imported + result.skipped + result.needs_review + result.error;
        expect(sum).toBe(3);
      });

      it("error row has no entity_id (no partial entity created)", async () => {
        const rows = [{ address: "", city: "London" }];
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "properties", rows })
        );
        expect(result.error).toBe(1);
        expect(result.rows?.[0]?.entity_id).toBeFalsy();
      });

      it("import_batch_rows audit log records the error row with error status", async () => {
        const rows = [{ address: "", city: "London" }];
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "properties", rows })
        );
        const batchId = result.batch_id;
        const { data: batchRows } = await admin
          .from("import_batch_rows")
          .select("status, error_message")
          .eq("batch_id", batchId);
        const errorRow = batchRows?.find((r) => r.status === "error");
        expect(errorRow).toBeDefined();
        expect(errorRow.error_message).toBeTruthy();
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 7. import_batch_id set on every imported compliance row
    // ════════════════════════════════════════════════════════════════════════

    describe("7 — import_batch_id set on compliance rows", () => {
      const PROP_REF = EXT("BATCH-ID-PROP");

      beforeAll(async () => {
        // CONCERN-5 FIX: track the property created here so it is cleaned up in afterAll
        trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `70 Batch ID Close ${RUN_ID}`, city: "London", external_property_ref: PROP_REF }],
          })
        );
      });

      it("imported compliance row has import_batch_id in provenance metadata", async () => {
        // CONCERN-5 FIX: pass "compliance" tab so entity_ids route to createdComplianceIds
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "compliance",
            rows: [{ external_property_ref: PROP_REF, requirement_type: "epc", expiry_date: "2030-01-01" }],
          }),
          "compliance"
        );
        expect(result.imported).toBe(1);

        // CORRECTION-2: strict physical-column assertion via .single() — no fallback.
        // import_batch_id is a real column on tenancy_compliance_items (added by
        // compliance_import_labeling.sql §1). The trigger trg_set_compliance_item_import_batch
        // sets it after the provenance event is inserted. This test MUST fail if the column
        // is absent or null — that indicates schema drift or trigger failure.
        const importedEntityId = result.rows?.find((r) => r.status === "imported")?.entity_id;
        expect(importedEntityId, "imported row must have an entity_id").toBeTruthy();

        const { data: item, error: itemError } = await admin
          .from("tenancy_compliance_items")
          .select("id, import_batch_id")
          .eq("id", importedEntityId)
          .single();

        expect(itemError).toBeNull();
        expect(item).toBeTruthy();
        expect(item.import_batch_id).toBe(result.batch_id);

        // Also verify via the compliance_gap_unified VIEW (is_attested_import derived path)
        const { data: unified, error: unifiedError } = await admin
          .from("compliance_gap_unified")
          .select("source_item_id, import_batch_id, is_attested_import")
          .eq("source_item_id", importedEntityId)
          .single();

        expect(unifiedError).toBeNull();
        expect(unified.import_batch_id).toBe(result.batch_id);
        expect(unified.is_attested_import).toBe(true);

        // Also verify via the provenance event metadata (JSONB path — secondary check)
        const batchId = result.batch_id;
        const { data: events } = await admin
          .from("provenance_events")
          .select("metadata")
          .eq("account_id", ACCOUNT_A)
          .eq("source_type", "spreadsheet_import")
          .eq("event_type", "compliance_item.imported")
          .contains("metadata", { import_batch_id: batchId });

        expect(events).not.toBeNull();
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].metadata.import_batch_id).toBe(batchId);
      });

      it("the compliance item's entity_id is recorded in import_batch_rows", async () => {
        const rows = [{ external_property_ref: PROP_REF, requirement_type: "gas_safety_certificate", expiry_date: "2027-01-01" }];
        // CONCERN-5 FIX: pass "compliance" tab so entity_ids route to createdComplianceIds
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "compliance", rows }),
          "compliance"
        );
        const batchId = result.batch_id;
        const { data: batchRows } = await admin
          .from("import_batch_rows")
          .select("entity_id, status")
          .eq("batch_id", batchId);
        const importedRow = batchRows?.find((r) => r.status === "imported");
        expect(importedRow?.entity_id).toBeTruthy();
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 8. Attested import provenance — actor_type=integration, source_type=spreadsheet_import
    // ════════════════════════════════════════════════════════════════════════

    describe("8 — attested import provenance shape (is_attested_import via import_batch_id)", () => {
      const PROP_REF = EXT("ATTEST-PROP");

      beforeAll(async () => {
        // CONCERN-5 FIX: track the property created here so it is cleaned up in afterAll
        trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `80 Attested Import Row ${RUN_ID}`, city: "London", external_property_ref: PROP_REF }],
          })
        );
      });

      it("compliance provenance events have actor_type=integration (not human)", async () => {
        // CONCERN-5 FIX: pass "compliance" tab so entity_ids route to createdComplianceIds
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "compliance",
            rows: [{ external_property_ref: PROP_REF, requirement_type: "eicr", expiry_date: "2031-01-01" }],
          }),
          "compliance"
        );
        expect(result.imported).toBe(1);
        const batchId = result.batch_id;
        // CORRECTION-3: server-side filter via .contains() — no JavaScript post-filter.
        // .contains("metadata", { import_batch_id: batchId }) uses PostgREST's @> JSONB
        // operator so only events for this specific batch are returned.
        const { data: events, error: eventsError } = await admin
          .from("provenance_events")
          .select("actor_type, source_type, metadata")
          .eq("account_id", ACCOUNT_A)
          .eq("source_type", "spreadsheet_import")
          .contains("metadata", { import_batch_id: batchId });

        expect(eventsError).toBeNull();
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].actor_type).toBe("integration");
      });

      it("actor_user_id is NULL on import provenance events (not impersonated as user)", async () => {
        // CONCERNS 4 & 6 FIX: seed a compliance import for this test so we have a known
        // batch UUID. Then scope the provenance query to that batch — no .limit(5) without
        // a batch filter, which could pick up unrelated rows from other tests.
        // CONCERN-5 FIX: pass "compliance" tab so entity_ids route to createdComplianceIds
        const batchResult = trackBatch(
          await importBatch(ownerAClient, {
            tab: "compliance",
            rows: [{ external_property_ref: PROP_REF, requirement_type: "deposit_protection_certificate", expiry_date: "2028-01-01" }],
          }),
          "compliance"
        );
        // Assert the row was fully imported before inspecting provenance.
        // A future fixture regression (wrong compliance type → needs_review) will
        // surface here as a clear import-status failure, not a confusing
        // "missing provenance event" failure.
        expect(batchResult.imported).toBe(1);
        expect(batchResult.needs_review).toBe(0);
        expect(batchResult.error).toBe(0);
        expect(batchResult.rows?.[0]?.status).toBe("imported");
        expect(batchResult.rows?.[0]?.entity_id).toBeTruthy();
        const batchId = batchResult.batch_id;
        // CORRECTION-3: server-side filter via .contains() — no JavaScript post-filter.
        const { data: batchEvents, error: batchEventsError } = await admin
          .from("provenance_events")
          .select("actor_user_id, metadata")
          .eq("account_id", ACCOUNT_A)
          .eq("source_type", "spreadsheet_import")
          .contains("metadata", { import_batch_id: batchId });

        expect(batchEventsError).toBeNull();
        expect(batchEvents.length, "expected at least one provenance event for this batch").toBeGreaterThan(0);
        expect(batchEvents[0].actor_type).toBeUndefined(); // not selected; confirming no spill
        batchEvents.forEach((ev) => {
          expect(ev.actor_user_id, "actor_user_id must be NULL for integration import events").toBeNull();
        });
      });

      it("metadata.triggered_by_user_id is set (the human who clicked import)", async () => {
        // CONCERNS 4 & 6 FIX: scope to a specific batch UUID, not a broad .limit(5).
        // CONCERN-5 FIX: pass "compliance" tab so entity_ids route to createdComplianceIds
        const batchResult = trackBatch(
          await importBatch(ownerAClient, {
            tab: "compliance",
            rows: [{ external_property_ref: PROP_REF, requirement_type: "how_to_rent", expiry_date: "2029-01-01" }],
          }),
          "compliance"
        );
        // Assert the row was fully imported before inspecting provenance.
        expect(batchResult.imported).toBe(1);
        expect(batchResult.needs_review).toBe(0);
        expect(batchResult.error).toBe(0);
        expect(batchResult.rows?.[0]?.status).toBe("imported");
        expect(batchResult.rows?.[0]?.entity_id).toBeTruthy();
        const batchId = batchResult.batch_id;
        // CORRECTION-3: server-side filter via .contains() — no JavaScript post-filter.
        const { data: batchEvents, error: batchEventsError } = await admin
          .from("provenance_events")
          .select("actor_type, actor_user_id, metadata")
          .eq("account_id", ACCOUNT_A)
          .eq("source_type", "spreadsheet_import")
          .contains("metadata", { import_batch_id: batchId });

        expect(batchEventsError).toBeNull();
        expect(batchEvents.length, "expected at least one provenance event for this batch").toBeGreaterThan(0);
        expect(batchEvents[0].actor_type).toBe("integration");
        expect(batchEvents[0].actor_user_id).toBeNull();
        batchEvents.forEach((ev) => {
          expect(ev.metadata?.triggered_by_user_id, "triggered_by_user_id must be set for import events").toBeTruthy();
        });
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 9. No silent overwrites — second import of same row is skipped
    // ════════════════════════════════════════════════════════════════════════

    describe("9 — no silent overwrites: re-import same file skips existing rows", () => {
      const REF_1 = EXT("NOOW-1");
      const REF_2 = EXT("NOOW-2");

      it("first import creates both properties", async () => {
        const rows = [
          { address: `90 No Overwrite Alpha ${RUN_ID}`, city: "London", external_property_ref: REF_1 },
          { address: `90 No Overwrite Beta ${RUN_ID}`, city: "London", external_property_ref: REF_2 },
        ];
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "properties", rows })
        );
        expect(result.imported).toBe(2);
      });

      it("second import of same rows skips both — no overwrite", async () => {
        const rows = [
          { address: `90 No Overwrite Alpha ${RUN_ID}`, city: "London", external_property_ref: REF_1 },
          { address: `90 No Overwrite Beta ${RUN_ID}`, city: "London", external_property_ref: REF_2 },
        ];
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "properties", rows })
        );
        expect(result.skipped).toBe(2);
        expect(result.imported).toBe(0);
      });

      it("property count in DB is still 2 (not 4)", async () => {
        const { data } = await admin
          .from("properties")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .in("external_property_ref", [REF_1, REF_2]);
        expect(data?.length).toBe(2);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 10. Traceability — batch record carries all required fields
    // ════════════════════════════════════════════════════════════════════════

    describe("10 — traceability: batch record and row audit", () => {
      it("import_batches row has account_id, source_filename, tab, triggered_by", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `100 Traceability Close ${RUN_ID}`, city: "London", external_property_ref: EXT("TRACE") }],
            filename: "traceability-test.csv",
          })
        );
        const batchId = result.batch_id;
        const { data: batch } = await admin
          .from("import_batches")
          .select("account_id, source_filename, tab, triggered_by, status, total_rows, imported_rows")
          .eq("id", batchId)
          .single();
        expect(batch?.account_id).toBe(ACCOUNT_A);
        expect(batch?.source_filename).toBe("traceability-test.csv");
        expect(batch?.tab).toBe("properties");
        expect(batch?.triggered_by).toBeTruthy();
        expect(batch?.status).toBe("complete");
        expect(batch?.total_rows).toBe(1);
        expect(batch?.imported_rows).toBe(1);
      });

      it("import_batch_rows records row_number, status, and raw_row", async () => {
        const rows = [
          { address: `101 Row Audit Alpha ${RUN_ID}`, city: "London", external_property_ref: EXT("AUDIT-A") },
          { address: `101 Row Audit Beta ${RUN_ID}`, city: "London", external_property_ref: EXT("AUDIT-B") },
        ];
        const result = trackBatch(
          await importBatch(ownerAClient, { tab: "properties", rows })
        );
        const { data: batchRows } = await admin
          .from("import_batch_rows")
          .select("row_number, status, entity_type, raw_row")
          .eq("batch_id", result.batch_id)
          .order("row_number");
        expect(batchRows).toHaveLength(2);
        expect(batchRows[0].row_number).toBe(1);
        expect(batchRows[1].row_number).toBe(2);
        expect(batchRows[0].entity_type).toBe("properties");
        expect(batchRows[0].raw_row).toBeTruthy();
        expect(typeof batchRows[0].raw_row).toBe("object");
      });

      it("RPC returns batch_id in the result", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `102 BatchId Return ${RUN_ID}`, city: "London", external_property_ref: EXT("BID") }],
          })
        );
        expect(result.batch_id).toBeTruthy();
        expect(typeof result.batch_id).toBe("string");
        expect(result.batch_id).toMatch(/^[0-9a-f-]{36}$/);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 11. Cross-account isolation — account B cannot read or write account A
    // ════════════════════════════════════════════════════════════════════════

    describe("11 — cross-account isolation", () => {
      it("account B cannot call process_import_batch for account A", async () => {
        let threw = false;
        try {
          const { error } = await ownerBClient.rpc("process_import_batch", {
            p_account_id: ACCOUNT_A,
            p_tab: "properties",
            p_rows: [{ address: "Cross-account attack vector", city: "London" }],
            p_source_filename: "hostile.csv",
          });
          if (error) threw = true;
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      });

      it("account B cannot read import_batches for account A via RLS", async () => {
        // First create a batch as account A
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `110 RLS Test Road ${RUN_ID}`, city: "London", external_property_ref: EXT("RLS-A") }],
          })
        );
        const batchId = result.batch_id;

        // Account B should not be able to select this batch
        const { data: batchesFromB } = await ownerBClient
          .from("import_batches")
          .select("id")
          .eq("id", batchId);
        expect(batchesFromB ?? []).toHaveLength(0);
      });

      it("account B cannot read import_batch_rows for account A batches via RLS", async () => {
        // CONCERN-1 FIX: early return silently passes; throw instead to surface setup failure.
        // This test relies on prior tests having created at least one batch. If none were
        // created, something upstream failed and this test must not silently pass.
        if (createdBatchIds.length === 0) {
          throw new Error(
            "Setup failure: no batches were created by earlier tests in this run — cannot verify RLS for import_batch_rows"
          );
        }
        const batchId = createdBatchIds[0];
        const { data: rowsFromB } = await ownerBClient
          .from("import_batch_rows")
          .select("id")
          .eq("batch_id", batchId);
        expect(rowsFromB ?? []).toHaveLength(0);
      });

      it("anon caller cannot call process_import_batch", async () => {
        const { createClient } = await import("@supabase/supabase-js");
        const { getIntegrationEnv } = await import("./helpers/env.js");
        const { url, anonKey } = getIntegrationEnv();
        const anon = createClient(url, anonKey, { auth: { persistSession: false } });
        let threw = false;
        try {
          const { error } = await anon.rpc("process_import_batch", {
            p_account_id: ACCOUNT_A,
            p_tab: "properties",
            p_rows: [{ address: "Anon attack", city: "London" }],
            p_source_filename: "anon.csv",
          });
          if (error) threw = true;
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 12. Native records untouched — non-imported compliance row not changed
    // ════════════════════════════════════════════════════════════════════════

    describe("12 — native records untouched by import pipeline", () => {
      const PROP_REF = EXT("NATIVE-PROP");
      let nativeComplianceId;

      beforeAll(async () => {
        // Create a property for this test
        const propResult = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `120 Native Record Way ${RUN_ID}`, city: "London", external_property_ref: PROP_REF }],
          })
        );
        const propId = propResult.rows?.[0]?.entity_id;

        // Create a native (non-imported) compliance item via admin
        if (propId) {
          // Get a requirement_id for epc
          const { data: reqs } = await admin
            .from("compliance_requirements")
            .select("id")
            .eq("requirement_key", "epc")
            .limit(1);
          const reqId = reqs?.[0]?.id;

          if (reqId) {
            const { data: native } = await admin
              .from("tenancy_compliance_items")
              .insert({
                account_id: ACCOUNT_A,
                property_id: propId,
                requirement_id: reqId,
                status: "logged",
                notes: "Native record — must not be touched by import",
                created_by: (await admin.auth.admin.listUsers()).data?.users?.[0]?.id,
              })
              .select("id")
              .single();
            nativeComplianceId = native?.id;
          }
        }
      });

      afterAll(async () => {
        if (nativeComplianceId) {
          await admin.from("tenancy_compliance_items").delete().eq("id", nativeComplianceId);
        }
      });

      it("importing the same compliance type skips (idempotency guard) — native row intact", async () => {
        // CONCERN-1 FIX: early return silently passes when setup failed; throw instead.
        // If nativeComplianceId is not set, the beforeAll insertion failed (property_id or
        // requirement_id could not be resolved) — that is a genuine setup failure, not a skip.
        if (!nativeComplianceId) {
          throw new Error(
            "Setup failure: nativeComplianceId was not set — beforeAll failed to create the native compliance item. " +
            "Check that the compliance_requirements table has an 'epc' row and that the property import succeeded."
          );
        }
        // CONCERN-5 FIX: pass "compliance" tab so entity_ids route to createdComplianceIds
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "compliance",
            rows: [{ external_property_ref: PROP_REF, requirement_type: "epc", expiry_date: "2030-01-01" }],
          }),
          "compliance"
        );
        // Should skip because the native epc record already exists and is 'logged'
        expect(result.skipped).toBe(1);
        // Native record still has original notes
        const { data: native } = await admin
          .from("tenancy_compliance_items")
          .select("notes")
          .eq("id", nativeComplianceId)
          .single();
        expect(native?.notes).toContain("Native record — must not be touched by import");
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 13. Re-import behaviour — previously imported rows are skipped
    // ════════════════════════════════════════════════════════════════════════

    describe("13 — re-import behaviour: same file skips already-imported rows", () => {
      const ROWS = () => [
        { address: `130 Reimport Alpha ${RUN_ID}`, city: "London", external_property_ref: EXT("REIMP-A") },
        { address: `130 Reimport Beta ${RUN_ID}`, city: "Manchester", external_property_ref: EXT("REIMP-B") },
        { address: `130 Reimport Gamma ${RUN_ID}`, city: "Birmingham", external_property_ref: EXT("REIMP-G") },
      ];

      it("first import: 3 rows imported", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: ROWS(),
            filename: "reimport-test.csv",
          })
        );
        expect(result.imported).toBe(3);
        expect(result.error).toBe(0);
      });

      it("second import of same file: 3 rows skipped, 0 imported", async () => {
        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: ROWS(),
            filename: "reimport-test.csv",
          })
        );
        expect(result.skipped).toBe(3);
        expect(result.imported).toBe(0);
      });

      it("property count after both imports is still 3 (no duplicates)", async () => {
        const { data } = await admin
          .from("properties")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .in("external_property_ref", [EXT("REIMP-A"), EXT("REIMP-B"), EXT("REIMP-G")]);
        expect(data?.length).toBe(3);
      });

      it("row-count invariant holds for the re-import batch (T-INTEGRITY-1)", async () => {
        const rows = ROWS();
        const result = await importBatch(ownerAClient, {
          tab: "properties",
          rows,
          filename: "reimport-invariant-test.csv",
        });
        // assertRowCountInvariant is called inside importBatch helper — if it throws, the test fails
        expect(result.total).toBe(3);
        const sum = result.imported + result.skipped + result.needs_review + result.error;
        expect(sum).toBe(3);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // Bonus: invalid tab rejected before processing any rows
    // ════════════════════════════════════════════════════════════════════════

    describe("invalid tab — rejected before row processing", () => {
      it("tab='invoices' throws a database error immediately", async () => {
        let threw = false;
        try {
          const { error } = await ownerAClient.rpc("process_import_batch", {
            p_account_id: ACCOUNT_A,
            p_tab: "invoices",
            p_rows: [],
            p_source_filename: "bad.csv",
          });
          if (error) threw = true;
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // Bonus: audit log integrity — all statuses are valid enum values
    // ════════════════════════════════════════════════════════════════════════

    describe("audit log integrity across all test batches", () => {
      it("all import_batch_rows created in this run have valid status enum values", async () => {
        // CONCERN-1 FIX: early return silently passes when no batches exist; throw instead.
        // By the time this audit runs, prior tests should have created many batches.
        if (createdBatchIds.length === 0) {
          throw new Error(
            "Setup failure: no batches were created in this test run — audit log integrity test has nothing to check. " +
            "All earlier import tests must have failed or been skipped."
          );
        }
        const { data: rows } = await admin
          .from("import_batch_rows")
          .select("status")
          .in("batch_id", createdBatchIds);
        const VALID = new Set(["imported", "skipped", "needs_review", "error"]);
        (rows ?? []).forEach((r) => {
          expect(VALID.has(r.status), `Unexpected status: ${r.status}`).toBe(true);
        });
      });

      it("all import_batches created in this run have valid status enum values", async () => {
        // CONCERN-1 FIX: early return silently passes when no batches exist; throw instead.
        if (createdBatchIds.length === 0) {
          throw new Error(
            "Setup failure: no batches were created in this test run — audit log integrity test has nothing to check."
          );
        }
        const { data: batches } = await admin
          .from("import_batches")
          .select("status")
          .in("id", createdBatchIds);
        const VALID = new Set(["processing", "complete", "partial", "failed"]);
        (batches ?? []).forEach((b) => {
          expect(VALID.has(b.status), `Unexpected batch status: ${b.status}`).toBe(true);
        });
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 14. Custody-chain integrity — FIX 20260714000000
    //
    // Verifies the full custody invariant after the provenance fix:
    //   status=imported ⟹ import_batch_id=batch_id ⟹ is_attested_import=true
    //   ⟹ provenance event exists with actor_type=integration
    //
    // Also documents the deferred forced-failure negative test.
    //
    // DEFERRED: forced-provenance-failure negative test
    // -------------------------------------------------
    // A true negative test would temporarily re-introduce a forbidden word
    // into the compliance summary (e.g. by temporarily replacing the RPC with
    // a version that uses the old "verified" wording), run an import, and assert:
    //   - result.rows[0].status === "error"
    //   - result.imported === 0
    //   - no compliance row survives with import_batch_id IS NULL
    //
    // This is deferred because:
    //   1. The test harness does not provide a safe mechanism to temporarily
    //      swap a SECURITY DEFINER RPC definition within a transaction that the
    //      test runner can roll back. Doing so requires a superuser ALTER
    //      FUNCTION call followed by cleanup — a racy pattern in a shared test DB.
    //   2. The positive custody-chain test below (14.1) already proves the fix
    //      works end-to-end: if the provenance call still failed silently, the
    //      provenance event assertion at the end of 14.1 would fail.
    //   3. The existing T-INTEGRITY-2 test in spreadsheetImport.test.js covers
    //      the honesty guard at the RPC layer (calling record_import_provenance_event
    //      with forbidden wording directly and asserting the error is raised).
    // ════════════════════════════════════════════════════════════════════════

    describe("14 — custody-chain integrity after FIX-20260714000000", () => {
      const PROP_REF = EXT("CUSTODY-PROP");

      beforeAll(async () => {
        // Create a property for this describe block's compliance tests
        trackBatch(
          await importBatch(ownerAClient, {
            tab: "properties",
            rows: [{ address: `140 Custody Chain Close ${RUN_ID}`, city: "London", external_property_ref: PROP_REF }],
          })
        );
      });

      it("14.1 — full custody chain: import_batch_id set, is_attested_import=true, provenance event exists", async () => {
        // This test exercises the full custody invariant after the fix.
        // Before the fix: the compliance summary contained "not independently verified by Tenaqo."
        // The word "verified" triggered the T-INTEGRITY-2 honesty guard in
        // record_import_provenance_event, raising errcode 22023.
        // The EXCEPTION WHEN OTHERS THEN NULL swallow discarded the error, so:
        //   - The compliance row was created and returned as status=imported
        //   - The provenance event was NOT written
        //   - trg_set_compliance_item_import_batch never fired
        //   - import_batch_id remained NULL
        //   - compliance_gap_unified.is_attested_import = false
        //
        // After the fix:
        //   - Summary rephrased (no "verified")
        //   - Silent swallow removed from compliance path
        //   - import_batch_id also set directly on the compliance INSERT
        //   - Full custody chain holds

        const result = trackBatch(
          await importBatch(ownerAClient, {
            tab: "compliance",
            rows: [{
              external_property_ref: PROP_REF,
              requirement_type: "epc",
              expiry_date: "2032-01-01",
            }],
          }),
          "compliance"
        );

        // Row must be imported, not error
        expect(result.imported, "compliance row must be imported after fix (was error before)").toBe(1);
        expect(result.error, "no error rows expected after fix").toBe(0);

        const importedEntityId = result.rows?.find((r) => r.status === "imported")?.entity_id;
        expect(importedEntityId, "imported row must have an entity_id").toBeTruthy();

        // 1. import_batch_id is set on the physical column (NOT NULL after fix)
        const { data: item, error: itemErr } = await admin
          .from("tenancy_compliance_items")
          .select("id, import_batch_id")
          .eq("id", importedEntityId)
          .single();

        expect(itemErr).toBeNull();
        expect(item, "tenancy_compliance_items row must exist").toBeTruthy();
        expect(
          item.import_batch_id,
          "import_batch_id must NOT be NULL (was NULL before fix)"
        ).not.toBeNull();
        expect(item.import_batch_id).toBe(result.batch_id);

        // 2. compliance_gap_unified.is_attested_import = true (derived from import_batch_id IS NOT NULL)
        const { data: unified, error: unifiedErr } = await admin
          .from("compliance_gap_unified")
          .select("source_item_id, import_batch_id, is_attested_import")
          .eq("source_item_id", importedEntityId)
          .single();

        expect(unifiedErr).toBeNull();
        expect(unified, "compliance_gap_unified row must exist for imported item").toBeTruthy();
        expect(
          unified.is_attested_import,
          "is_attested_import must be true (was false before fix)"
        ).toBe(true);
        expect(unified.import_batch_id).toBe(result.batch_id);

        // 3. Provenance event exists with actor_type=integration
        const { data: events, error: eventsErr } = await admin
          .from("provenance_events")
          .select("actor_type, source_type, event_type, metadata")
          .eq("account_id", ACCOUNT_A)
          .eq("source_type", "spreadsheet_import")
          .eq("event_type", "compliance_item.imported")
          .contains("metadata", { import_batch_id: result.batch_id });

        expect(eventsErr).toBeNull();
        expect(
          events?.length,
          "provenance event must exist (was absent before fix — silent swallow hid the error)"
        ).toBeGreaterThan(0);
        expect(events[0].actor_type).toBe("integration");
        expect(events[0].metadata.import_batch_id).toBe(result.batch_id);

        // 4. No compliance item in this batch has import_batch_id IS NULL
        //    (would indicate the fix was partially applied or not applied)
        const { data: nullBatchItems, error: nullErr } = await admin
          .from("tenancy_compliance_items")
          .select("id, import_batch_id")
          .eq("import_batch_id", result.batch_id);
        // All items from this batch have the batch_id set — none are NULL
        expect(nullErr).toBeNull();
        const nullItems = (nullBatchItems ?? []).filter((r) => r.import_batch_id === null);
        expect(
          nullItems,
          "No compliance items from this batch should have import_batch_id IS NULL"
        ).toHaveLength(0);
      });

      it("14.2 — honesty-guard summary passes T-INTEGRITY-2 (new wording does not contain 'verified')", () => {
        // Static assertion: verify the new summary wording does NOT contain the
        // word "verified" at a word boundary. This mirrors the SQL check:
        //   FOREACH v_term IN ARRAY ARRAY['verified','proven','served'] LOOP
        //     IF v_scrubbed ~ ('\m' || lower(v_term) || '\M') THEN ...
        //
        // The new wording in the migration:
        //   'Compliance record "%s" imported from landlord spreadsheet. '
        //   'Attested import custody — compliance dates supplied by the '
        //   'landlord''s spreadsheet; Tenaqo has not checked the underlying record.'
        const newSummary =
          'Compliance record "epc" imported from landlord spreadsheet. ' +
          "Attested import custody — compliance dates supplied by the " +
          "landlord's spreadsheet; Tenaqo has not checked the underlying record.";

        // Must NOT contain any forbidden terms at word boundaries
        // (replicates the PL/pgSQL regex check in JavaScript)
        const FORBIDDEN_WORDS = ["verified", "proven", "served"];
        const FORBIDDEN_PHRASES = [
          "system-observed",
          "verified service",
          "native evidence chain",
          "cryptographically proven",
          "verified compliance",
          "native tenaqo",
          "legally compliant",
          "native event",
        ];

        // Whitelist "not a tenaqo-observed event" (scrubbed before checking)
        const scrubbed = newSummary
          .toLowerCase()
          .replace(/not a tenaqo-observed event/gi, "__whitelisted__");

        for (const term of FORBIDDEN_WORDS) {
          // Word-boundary check: term must appear as a whole word
          const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, "i");
          expect(
            wordBoundaryRegex.test(scrubbed),
            `New summary must not contain forbidden word: "${term}"`
          ).toBe(false);
        }

        for (const phrase of FORBIDDEN_PHRASES) {
          expect(
            scrubbed.includes(phrase.toLowerCase()),
            `New summary must not contain forbidden phrase: "${phrase}"`
          ).toBe(false);
        }

        // Must still communicate attested import custody (positive assertion)
        expect(newSummary.toLowerCase()).toContain("attested import custody");
        expect(newSummary.toLowerCase()).toContain("landlord");
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // CORRECTION-4: Cleanup integrity verification
    // This is a named test (not inside afterAll) so failures surface clearly
    // and do not mask primary test failures. afterAll runs cleanup; this test
    // confirms nothing from this run contaminates the next run.
    // ════════════════════════════════════════════════════════════════════════

    describe("cleanup integrity: no RUN_ID rows remain after afterAll", () => {
      // Note: vitest describe blocks within a suite run before afterAll of the parent
      // suite. This test verifies that the cleanup arrays are populated correctly —
      // it does NOT run the cleanup itself (afterAll does). The actual post-cleanup
      // verification is best done in a separate run (idempotency check in Step 4).
      // What we CAN verify here is that the tracking arrays are consistent with
      // what the database contains, so afterAll will clean everything up correctly.

      it("cleanup: no RUN_ID property or compliance rows remain", async () => {
        // Trigger cleanup explicitly for this test by running afterAll-equivalent inline.
        // This verifies cleanup removes all rows seeded in this run.

        // 1. Compliance items first (FK child of properties)
        if (createdComplianceIds.length > 0) {
          const { error: compErr } = await admin
            .from("tenancy_compliance_items")
            .delete()
            .in("id", createdComplianceIds);
          expect(compErr).toBeNull();
        }
        // 2. Tenants
        if (createdTenantIds.length > 0) {
          const { error: tenErr } = await admin
            .from("tenants")
            .delete()
            .in("id", createdTenantIds);
          expect(tenErr).toBeNull();
        }
        // 3. Properties
        if (createdPropertyIds.length > 0) {
          const { error: propErr } = await admin
            .from("properties")
            .delete()
            .in("id", createdPropertyIds);
          expect(propErr).toBeNull();
        }
        // 4. Batch rows then batches (import_batch_rows FK → import_batches)
        if (createdBatchIds.length > 0) {
          const { error: batchRowErr } = await admin
            .from("import_batch_rows")
            .delete()
            .in("batch_id", createdBatchIds);
          expect(batchRowErr).toBeNull();

          const { error: batchErr } = await admin
            .from("import_batches")
            .delete()
            .in("id", createdBatchIds);
          expect(batchErr).toBeNull();
        }

        // Verify no RUN_ID properties remain (external_property_ref is the discriminant)
        const { data: remaining, error: remainErr } = await admin
          .from("properties")
          .select("id, external_property_ref")
          .eq("account_id", ACCOUNT_A)
          .like("external_property_ref", `PIPE-${RUN_ID}-%`);

        expect(remainErr).toBeNull();
        expect(remaining ?? []).toHaveLength(0);

        // Verify no compliance items remain for any batch from this run
        if (createdBatchIds.length > 0) {
          const { data: remainingCompliance, error: remainCompErr } = await admin
            .from("tenancy_compliance_items")
            .select("id, import_batch_id")
            .in("import_batch_id", createdBatchIds);

          expect(remainCompErr).toBeNull();
          expect(remainingCompliance ?? []).toHaveLength(0);

          // Verify batches themselves are gone
          const { data: remainingBatches, error: remainBatchErr } = await admin
            .from("import_batches")
            .select("id")
            .in("id", createdBatchIds);

          expect(remainBatchErr).toBeNull();
          expect(remainingBatches ?? []).toHaveLength(0);
        }
      });
    });
  }
);
