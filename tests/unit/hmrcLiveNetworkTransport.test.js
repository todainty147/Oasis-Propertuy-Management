import { describe, expect, it } from "vitest";

import {
  normalizeHmrcLiveNetworkError,
  performHmrcLiveNetworkRequest,
} from "../../supabase/functions/_shared/hmrcLiveNetworkTransport.ts";

const base = {
  url: "https://api.service.hmrc.gov.uk/example",
  accessToken: "must-not-leak",
  accept: "application/vnd.hmrc.6.0+json",
  payload: { ukProperty: { income: { periodAmount: 100 } } },
  accountId: "account-123",
  userId: "user-123",
};

describe("HMRC live network transport", () => {
  it("returns timeout with unknown acceptance and blind-retry warning", async () => {
    const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    const result = await performHmrcLiveNetworkRequest({ ...base, timeoutMs: 5, fetchImpl });
    expect(result.outcome).toBe("timeout");
    expect(result.acceptanceState).toBe("unknown");
    expect(result.message).toMatch(/do not retry blindly/i);
    expect(result.status).toBe(0);
  });

  it("classifies definite connection failure as network_error", async () => {
    const fetchImpl = async () => { throw new TypeError("connect ECONNREFUSED"); };
    const result = await performHmrcLiveNetworkRequest({ ...base, fetchImpl });
    expect(result.outcome).toBe("network_error");
    expect(result.acceptanceState).toBe("not_sent");
  });

  it("classifies unexpected fetch throw conservatively without leaking secrets", async () => {
    const fetchImpl = async () => { throw new TypeError("fetch failed"); };
    const result = await performHmrcLiveNetworkRequest({ ...base, fetchImpl });
    expect(result.outcome).toBe("unknown_acceptance_state");
    expect(result.message).toMatch(/do not retry blindly/i);
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|periodAmount/);
  });

  it("preserves accepted 204 no-body handling", async () => {
    const result = await performHmrcLiveNetworkRequest({
      ...base,
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    expect(result.outcome).toBe("accepted");
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({});
  });

  it("distinguishes validation rejection and HMRC unavailability", async () => {
    const validation = await performHmrcLiveNetworkRequest({
      ...base,
      fetchImpl: async () => new Response(JSON.stringify({ code: "RULE_INCORRECT_OR_EMPTY_BODY" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    });
    const unavailable = await performHmrcLiveNetworkRequest({
      ...base,
      fetchImpl: async () => new Response(JSON.stringify({ code: "SERVER_ERROR" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    });
    expect(validation.outcome).toBe("validation_failed");
    expect(unavailable.outcome).toBe("hmrc_unavailable");
  });

  it("normalizes connection resets to unknown acceptance", () => {
    expect(normalizeHmrcLiveNetworkError(new Error("connection reset by peer"))).toMatchObject({
      outcome: "unknown_acceptance_state",
      acceptanceState: "unknown",
    });
  });
});
