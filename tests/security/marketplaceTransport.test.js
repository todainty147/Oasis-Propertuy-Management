import { describe, expect, it } from "vitest";

import {
  buildMarketplaceRequestDate,
  buildMarketplaceSubmissionBody,
  buildMarketplaceTransportHeaders,
  classifyMarketplaceSubmissionFailure,
  extractMarketplaceExternalFields,
  normalizeMarketplaceTransportUrl,
  validateMarketplaceSubmissionReadiness,
} from "../../supabase/functions/_shared/marketplaceTransport.ts";

describe("marketplace transport helpers", () => {
  it("normalizes only explicit http and https provider endpoints", () => {
    expect(normalizeMarketplaceTransportUrl("https://api.provider.example/jobs")).toBe(
      "https://api.provider.example/jobs",
    );
    expect(normalizeMarketplaceTransportUrl("http://localhost:8787/mock")).toBe(
      "http://localhost:8787/mock",
    );
    expect(normalizeMarketplaceTransportUrl("javascript:alert(1)")).toBe("");
    expect(normalizeMarketplaceTransportUrl("api.provider.example")).toBe("");
  });

  it("builds a Checkatrade /jobs payload from the prepared handoff payload", () => {
    expect(
      buildMarketplaceSubmissionBody(
        {
          marketplaceJobId: "job-1",
          workOrderId: "wo-1",
          providerKey: "checkatrade",
          title: "Boiler leak",
          description: "Urgent leak in the kitchen",
          urgency: "high",
          postcode: "SW1A 1AA",
          city: "London",
          propertyLabel: "10 Market Street",
          tradeCategory: "plumbing",
          contactName: "Alice Owner",
          contactEmail: "alice@example.test",
          contactPhone: "+44 111 222 333",
          requestPayload: { source: "panel", line2: "Flat 2" },
          metadata: { route: "marketplace" },
        },
        "acct-ref-1",
        {
          trade_category_map: {
            plumbing: 667,
          },
          default_preferred_start_id: "WITHIN_2_WEEKS",
        },
      ),
    ).toEqual({
      categoryId: 667,
      description: "Urgent leak in the kitchen",
      email: "alice@example.test",
      phone: "+44 111 222 333",
      firstName: "Alice",
      lastName: "Owner",
      postcode: "SW1A 1AA",
      preferredStart: {
        id: "WITHIN_2_WEEKS",
      },
      address: {
        line1: "10 Market Street",
        line2: "Flat 2",
        city: "London",
        postcode: "SW1A 1AA",
      },
      accountReference: "acct-ref-1",
    });
  });

  it("builds Checkatrade HMAC headers over request target, date, content type, and body digest", () => {
    expect(buildMarketplaceRequestDate(new Date("2026-04-27T12:34:56.789Z"))).toBe(
      "2026-04-27T12:34:56.789Z",
    );

    expect(
      buildMarketplaceTransportHeaders({
        endpointUrl: "https://api.checkatrade.com/v1/affiliate-job/jobs",
        apiKey: "affiliate-key",
        apiSecret: "affiliate-secret",
        requestDate: "2026-04-27T12:34:56.789Z",
        timeoutMs: 5000,
        staticHeaders: {
          "X-Provider-Tenant": "tenant-1",
        },
        idempotencyKey: "oasis:account-1:job-1",
        signatureBody: JSON.stringify({ categoryId: 667 }),
      }),
    ).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": "oasis:account-1:job-1",
      "X-OASIS-Marketplace-Job-Id": "oasis:account-1:job-1",
      "X-Provider-Tenant": "tenant-1",
      Date: "2026-04-27T12:34:56.789Z",
      Digest: "SHA-256=fS0KWEuQ0AttVYW38VfhSSp9q7OnnhOMxwMEin0tOgw=",
      Authorization:
        'Signature keyId="affiliate-key",algorithm="hmac-sha256",headers="(request-target) date content-type digest",signature="O52CQ68OXy3XCwUvBlWVqFmir8xLSXv6tGAQ4w4PBzA="',
    });
  });

  it("extracts provider references from common response shapes and headers", () => {
    const response = new Response(null, {
      status: 201,
      headers: {
        location: "https://api.provider.example/jobs/abc123",
        "x-provider-reference": "ref-9",
      },
    });

    expect(
      extractMarketplaceExternalFields(
        {
          job_id: "ext-job-7",
        },
        response,
      ),
    ).toMatchObject({
      externalJobId: "ext-job-7",
      externalReference: "ref-9",
      externalUrl: "https://api.provider.example/jobs/abc123",
      trades: [],
    });
  });

  it("classifies provider failures into retryable failed vs manual follow-up states", () => {
    expect(
      classifyMarketplaceSubmissionFailure({
        httpStatus: 502,
        attemptCount: 1,
        maxAttempts: 3,
      }),
    ).toEqual({
      retryable: true,
      nextStatus: "failed",
    });

    expect(
      classifyMarketplaceSubmissionFailure({
        httpStatus: 400,
        attemptCount: 1,
        maxAttempts: 3,
      }),
    ).toEqual({
      retryable: false,
      nextStatus: "manual_follow_up",
    });

    expect(
      classifyMarketplaceSubmissionFailure({
        httpStatus: 429,
        attemptCount: 3,
        maxAttempts: 3,
      }),
    ).toEqual({
      retryable: true,
      nextStatus: "manual_follow_up",
    });
  });

  it("flags missing Checkatrade-required fields before live submission", () => {
    expect(
      validateMarketplaceSubmissionReadiness(
        {
          endpointUrl: "https://api.checkatrade.com/v1/affiliate-job/jobs",
          apiKey: "affiliate-key",
          apiSecret: "affiliate-secret",
          timeoutMs: 5000,
          idempotencyKey: "oasis:account-1:job-1",
          providerConfiguration: {},
        },
        {
          marketplaceJobId: "job-1",
          workOrderId: "wo-1",
          providerKey: "checkatrade",
          title: "Boiler",
          description: "short",
          urgency: "high",
          postcode: "",
          city: "London",
          propertyLabel: "10 Market Street",
          tradeCategory: "plumbing",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          requestPayload: {},
          metadata: {},
        },
      ),
    ).toEqual([
      "Checkatrade categoryId is missing. Configure a trade_category_map/default_category_id or pass categoryId in the marketplace request payload.",
      "Checkatrade requires a description of at least 10 characters.",
      "Checkatrade requires a contact email.",
      "Checkatrade requires a contact phone number.",
      "Checkatrade requires a contact first and last name.",
      "Checkatrade requires a postcode.",
    ]);
  });

  it("extracts trades array from a Checkatrade response body alongside external fields", () => {
    const response = new Response(null, { status: 201 });
    const payload = {
      job_id: "chk-job-42",
      trades: [
        { id: "t-1", name: "Alpha Plumbing Ltd", profileURL: "https://www.checkatrade.com/trades/alpha-plumbing" },
        { id: "t-2", name: "Beta Plumbers", profileURL: "https://www.checkatrade.com/trades/beta-plumbers" },
      ],
    };

    const result = extractMarketplaceExternalFields(payload, response);

    expect(result.externalJobId).toBe("chk-job-42");
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toEqual({
      id: "t-1",
      name: "Alpha Plumbing Ltd",
      profileURL: "https://www.checkatrade.com/trades/alpha-plumbing",
    });
    expect(result.trades[1]).toEqual({
      id: "t-2",
      name: "Beta Plumbers",
      profileURL: "https://www.checkatrade.com/trades/beta-plumbers",
    });
  });

  it("returns an empty trades array when the Checkatrade response has no trades", () => {
    const response = new Response(null, { status: 201 });
    const result = extractMarketplaceExternalFields({ job_id: "chk-job-99" }, response);
    expect(result.trades).toEqual([]);
  });

  it("normalises trades that use profile_url instead of profileURL", () => {
    const response = new Response(null, { status: 201 });
    const payload = {
      job_id: "chk-job-7",
      trades: [{ id: "t-3", name: "Gamma Gas", profile_url: "https://www.checkatrade.com/trades/gamma-gas" }],
    };
    const result = extractMarketplaceExternalFields(payload, response);
    expect(result.trades[0].profileURL).toBe("https://www.checkatrade.com/trades/gamma-gas");
  });

  it("strips profile URLs that are not https:// checkatrade.com links", () => {
    const response = new Response(null, { status: 201 });
    const payload = {
      job_id: "chk-job-8",
      trades: [
        { id: "t-safe", name: "Safe Trade", profileURL: "https://www.checkatrade.com/trades/safe" },
        { id: "t-http", name: "HTTP Trade", profileURL: "http://www.checkatrade.com/trades/http" },
        { id: "t-js", name: "XSS Trade", profileURL: "javascript:alert(1)" },
        { id: "t-other", name: "Other Domain", profileURL: "https://evil.example.com/redirect" },
        { id: "t-empty", name: "No URL Trade", profileURL: "" },
      ],
    };
    const result = extractMarketplaceExternalFields(payload, response);
    expect(result.trades).toHaveLength(5);
    expect(result.trades[0].profileURL).toBe("https://www.checkatrade.com/trades/safe");
    expect(result.trades[1].profileURL).toBe("");
    expect(result.trades[2].profileURL).toBe("");
    expect(result.trades[3].profileURL).toBe("");
    expect(result.trades[4].profileURL).toBe("");
  });

  it("classifies 422 (spam) as non-retryable manual follow-up", () => {
    expect(
      classifyMarketplaceSubmissionFailure({ httpStatus: 422, attemptCount: 1, maxAttempts: 3 }),
    ).toEqual({ retryable: false, nextStatus: "manual_follow_up" });
  });

  it("classifies 404 (no trades found) as non-retryable manual follow-up", () => {
    expect(
      classifyMarketplaceSubmissionFailure({ httpStatus: 404, attemptCount: 1, maxAttempts: 3 }),
    ).toEqual({ retryable: false, nextStatus: "manual_follow_up" });
  });
});
