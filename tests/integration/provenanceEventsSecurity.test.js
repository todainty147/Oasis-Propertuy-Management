import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;

function eventInput(accountId, overrides = {}) {
  return {
    p_account_id: accountId,
    p_entity_type: "test_entity",
    p_entity_id: randomUUID(),
    p_event_type: "test.recorded",
    p_actor_type: "human",
    p_occurred_at: new Date().toISOString(),
    p_summary: "Integration provenance event",
    p_metadata: { source: "integration-test" },
    ...overrides,
  };
}

async function record(client, input) {
  const { data, error } = await client.rpc("record_provenance_event", input);
  return { data, error };
}

describe("provenance event ledger security", () => {
  integrationIt("enforces account isolation, closed tenant access, and RPC membership", async () => {
    await ensureIsolationHarnessSeed();
    const { client: ownerA } = await signInAsFixtureUser("ownerA");
    const { client: ownerB } = await signInAsFixtureUser("ownerB");
    const { client: tenantA } = await signInAsFixtureUser("tenantA1");
    const event = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id));

    expect(event.error).toBeNull();

    const crossRead = await ownerB
      .from("provenance_events")
      .select("id")
      .eq("id", event.data.id);
    expect(crossRead.error).toBeNull();
    expect(crossRead.data).toEqual([]);

    const crossCreate = await record(
      ownerA,
      eventInput(isolationFixtures.accounts.accountB.id),
    );
    expect(crossCreate.error).not.toBeNull();

    const tenantRead = await tenantA
      .from("provenance_events")
      .select("id")
      .eq("id", event.data.id);
    expect(tenantRead.error).toBeNull();
    expect(tenantRead.data).toEqual([]);

    const tenantCreate = await record(
      tenantA,
      eventInput(isolationFixtures.accounts.accountA.id),
    );
    expect(tenantCreate.error).not.toBeNull();
  });

  integrationIt("blocks direct inserts, updates, and deletes and server-owns recorded_at", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const created = await record(client, eventInput(isolationFixtures.accounts.accountA.id));
    expect(created.error).toBeNull();

    const directInsert = await client.from("provenance_events").insert({
      ...created.data,
      id: randomUUID(),
      sequence_number: created.data.sequence_number + 1000,
      recorded_at: "2000-01-01T00:00:00.000Z",
    });
    expect(directInsert.error).not.toBeNull();

    const update = await client
      .from("provenance_events")
      .update({ summary: "mutated" })
      .eq("id", created.data.id);
    expect(update.error).not.toBeNull();

    const deletion = await client
      .from("provenance_events")
      .delete()
      .eq("id", created.data.id);
    expect(deletion.error).not.toBeNull();

    expect(new Date(created.data.recorded_at).getTime()).toBeGreaterThan(
      Date.now() - 30_000,
    );
  });

  integrationIt("allocates ordered account sequences under concurrency", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const calls = Array.from({ length: 8 }, () =>
      record(client, eventInput(isolationFixtures.accounts.accountA.id)),
    );
    const results = await Promise.all(calls);

    expect(results.every(({ error }) => error === null)).toBe(true);
    const sequences = results.map(({ data }) => Number(data.sequence_number)).sort((a, b) => a - b);
    expect(new Set(sequences).size).toBe(results.length);
    expect(sequences.at(-1) - sequences[0]).toBe(results.length - 1);
  });

  integrationIt("uses independent account locks and counters", async () => {
    const [{ client: ownerA }, { client: ownerB }] = await Promise.all([
      signInAsFixtureUser("ownerA"),
      signInAsFixtureUser("ownerB"),
    ]);
    const [resultA, resultB] = await Promise.all([
      record(ownerA, eventInput(isolationFixtures.accounts.accountA.id)),
      record(ownerB, eventInput(isolationFixtures.accounts.accountB.id)),
    ]);

    expect(resultA.error).toBeNull();
    expect(resultB.error).toBeNull();
    expect(resultA.data.account_id).not.toBe(resultB.data.account_id);
  });

  integrationIt("returns one event for concurrent duplicate idempotency keys", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const idempotencyKey = `test:${randomUUID()}`;
    const input = eventInput(isolationFixtures.accounts.accountA.id, {
      p_idempotency_key: idempotencyKey,
    });
    const [first, second] = await Promise.all([
      record(client, input),
      record(client, input),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data.id).toBe(second.data.id);

    const rows = await client
      .from("provenance_events")
      .select("id")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .eq("idempotency_key", idempotencyKey);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
  });

  integrationIt("records valid corrections and reversals and rejects invalid references", async () => {
    const { client: ownerA } = await signInAsFixtureUser("ownerA");
    const { client: ownerB } = await signInAsFixtureUser("ownerB");
    const entityId = randomUUID();
    const originalA = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id, {
      p_entity_id: entityId,
    }));
    const originalB = await record(ownerB, eventInput(isolationFixtures.accounts.accountB.id));
    expect(originalA.error).toBeNull();
    expect(originalB.error).toBeNull();

    const correction = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id, {
      p_entity_id: entityId,
      p_event_type: "test.corrected",
      p_supersedes_event_id: originalA.data.id,
    }));
    expect(correction.error).toBeNull();

    const reversal = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id, {
      p_entity_id: entityId,
      p_event_type: "test.reversed",
      p_reversal_of_event_id: originalA.data.id,
    }));
    expect(reversal.error).toBeNull();

    const both = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id, {
      p_entity_id: entityId,
      p_supersedes_event_id: originalA.data.id,
      p_reversal_of_event_id: originalA.data.id,
    }));
    expect(both.error).not.toBeNull();

    const crossSupersede = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id, {
      p_supersedes_event_id: originalB.data.id,
    }));
    expect(crossSupersede.error).not.toBeNull();

    const crossReverse = await record(ownerA, eventInput(isolationFixtures.accounts.accountA.id, {
      p_reversal_of_event_id: originalB.data.id,
    }));
    expect(crossReverse.error).not.toBeNull();
  });

  integrationIt("enforces metadata, actor, future-time, and default visibility integrity", async () => {
    const { client, user } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;

    const human = await record(client, eventInput(accountId));
    expect(human.error).toBeNull();
    expect(human.data.actor_user_id).toBe(user.id);
    expect(human.data.visibility).toBe("internal");

    const invalidMetadata = await record(client, eventInput(accountId, {
      p_metadata: ["not", "an", "object"],
    }));
    expect(invalidMetadata.error).not.toBeNull();

    const future = await record(client, eventInput(accountId, {
      p_occurred_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }));
    expect(future.error).not.toBeNull();

    const missingSystemSource = await record(client, eventInput(accountId, {
      p_actor_type: "system",
      p_metadata: {},
    }));
    expect(missingSystemSource.error).not.toBeNull();
  });
});
