import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("custom fields security", () => {
  const admin = getIntegrationAdminClient();

  it("lets a manager create property and tenant custom fields and store typed values", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const propertyId = isolationFixtures.users.tenantA1.propertyId;
    const tenantId = isolationFixtures.users.tenantA1.tenantId;
    const suffix = Date.now();

    const propertyField = await client
      .from("custom_field_definitions")
      .insert({
        account_id: accountId,
        entity_type: "property",
        field_type: "text",
        name: `access notes ${suffix}`,
      })
      .select("id, account_id, entity_type, field_type, name")
      .single();

    expect(propertyField.error).toBeNull();
    expect(propertyField.data).toMatchObject({
      account_id: accountId,
      entity_type: "property",
      field_type: "text",
    });

    const tenantField = await client
      .from("custom_field_definitions")
      .insert({
        account_id: accountId,
        entity_type: "tenant",
        field_type: "date",
        name: `renewal follow-up ${suffix}`,
      })
      .select("id, account_id, entity_type, field_type, name")
      .single();

    expect(tenantField.error).toBeNull();
    expect(tenantField.data).toMatchObject({
      account_id: accountId,
      entity_type: "tenant",
      field_type: "date",
    });

    const propertyValue = await client
      .from("custom_field_values")
      .insert({
        definition_id: propertyField.data.id,
        account_id: accountId,
        entity_id: propertyId,
        text_value: "Meter room code is 4582",
      })
      .select("definition_id, account_id, entity_id, text_value, number_value, date_value")
      .single();

    expect(propertyValue.error).toBeNull();
    expect(propertyValue.data).toMatchObject({
      definition_id: propertyField.data.id,
      account_id: accountId,
      entity_id: propertyId,
      text_value: "Meter room code is 4582",
      number_value: null,
      date_value: null,
    });

    const tenantValue = await client
      .from("custom_field_values")
      .insert({
        definition_id: tenantField.data.id,
        account_id: accountId,
        entity_id: tenantId,
        date_value: "2026-05-15",
      })
      .select("definition_id, account_id, entity_id, text_value, number_value, date_value")
      .single();

    expect(tenantValue.error).toBeNull();
    expect(tenantValue.data).toMatchObject({
      definition_id: tenantField.data.id,
      account_id: accountId,
      entity_id: tenantId,
      text_value: null,
      number_value: null,
      date_value: "2026-05-15",
    });
  });

  it("rejects tenant writes and blocks cross-account entity misuse", async () => {
    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const foreignPropertyId = isolationFixtures.users.tenantB1.propertyId;
    const suffix = Date.now();

    const definitionResult = await ownerClient
      .from("custom_field_definitions")
      .insert({
        account_id: accountId,
        entity_type: "property",
        field_type: "number",
        name: `door count ${suffix}`,
      })
      .select("id")
      .single();

    expect(definitionResult.error).toBeNull();

    const tenantDefinitionWrite = await tenantClient
      .from("custom_field_definitions")
      .insert({
        account_id: accountId,
        entity_type: "tenant",
        field_type: "text",
        name: `tenant blocked ${suffix}`,
      });

    expect(tenantDefinitionWrite.error).toBeTruthy();

    const crossAccountValueWrite = await ownerClient
      .from("custom_field_values")
      .insert({
        definition_id: definitionResult.data.id,
        account_id: accountId,
        entity_id: foreignPropertyId,
        number_value: 12,
      });

    expect(crossAccountValueWrite.error).toBeTruthy();
    expect(String(crossAccountValueWrite.error?.message || "").toLowerCase()).toContain("in-scope property");

    const rows = await admin
      .from("custom_field_values")
      .select("id")
      .eq("definition_id", definitionResult.data.id);

    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });
});
