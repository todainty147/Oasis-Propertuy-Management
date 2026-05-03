import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
} from "./helpers/localSupabaseHarness.js";

describe("API rate limit persistence", () => {
  let admin;
  let users;

  beforeAll(async () => {
    users = await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
  });

  it("allows attempts within the configured window and blocks excess attempts with observability", async () => {
    const surface = `integration_rate_limit_${crypto.randomUUID()}`;
    const accountId = isolationFixtures.accounts.accountA.id;
    const actorUserId = users.ownerA.id;
    const identifierHash = crypto.randomUUID().replaceAll("-", "");

    const first = await admin.rpc("record_api_rate_limit_attempt", {
      p_surface: surface,
      p_account_id: accountId,
      p_actor_user_id: actorUserId,
      p_identifier_hash: identifierHash,
      p_window_seconds: 3600,
      p_max_attempts: 1,
      p_metadata: {
        correlation_id: "rate-limit-integration-test",
        limit_scope: "integration",
      },
    });

    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      allowed: true,
      attempt_count: 1,
      max_attempts: 1,
    });

    const second = await admin.rpc("record_api_rate_limit_attempt", {
      p_surface: surface,
      p_account_id: accountId,
      p_actor_user_id: actorUserId,
      p_identifier_hash: identifierHash,
      p_window_seconds: 3600,
      p_max_attempts: 1,
      p_metadata: {
        correlation_id: "rate-limit-integration-test",
        limit_scope: "integration",
      },
    });

    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({
      allowed: false,
      attempt_count: 2,
      max_attempts: 1,
    });
    expect(Number(second.data.retry_after_seconds)).toBeGreaterThan(0);

    const { data: events, error: eventError } = await admin
      .from("security_observability_events")
      .select("account_id, actor_user_id, category, kind, surface, reason, outcome, code, guard_denied")
      .eq("surface", surface)
      .eq("reason", "rate_limit_exceeded");

    expect(eventError).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      account_id: accountId,
      actor_user_id: actorUserId,
      category: "api_rate_limit",
      kind: "authorization_denied",
      reason: "rate_limit_exceeded",
      outcome: "denied",
      code: "429",
      guard_denied: true,
    });
  });
});
