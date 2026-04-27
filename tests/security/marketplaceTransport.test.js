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

  it("builds Checkatrade HMAC headers with a date-based signature", () => {
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
      }),
    ).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": "oasis:account-1:job-1",
      "X-OASIS-Marketplace-Job-Id": "oasis:account-1:job-1",
      "X-Provider-Tenant": "tenant-1",
      Date: "2026-04-27T12:34:56.789Z",
      Authorization:
        'Signature keyId="affiliate-key",algorithm="hmac-sha256",signature="qXHeo+Yc1T02KibXcWXC6d5VA2opP49ny0MLNCgvjAY="',
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
    ).toEqual({
      externalJobId: "ext-job-7",
      externalReference: "ref-9",
      externalUrl: "https://api.provider.example/jobs/abc123",
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
});
