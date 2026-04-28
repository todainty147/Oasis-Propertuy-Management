import { describe, expect, it, vi } from "vitest";

import {
  PRODUCT_ANALYTICS_EVENTS,
  buildProductAnalyticsEvent,
  sanitizeProductAnalyticsProperties,
  trackProductAnalyticsEvent,
} from "../../src/services/productAnalyticsService.js";

describe("product analytics service", () => {
  it("builds known activation events with a stable, sanitized payload", () => {
    const event = buildProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.ACCOUNT_CREATED,
      {
        account_id: "account-1",
        user_id: "user-1",
        role: "owner",
        is_demo: true,
        sandbox_mode: "demo",
        email: "owner@example.com",
        invite_token: "secret-token",
        full_address: "12 Secret Street",
      },
      new Date("2026-04-28T10:00:00.000Z"),
    );

    expect(event).toEqual({
      event_name: "account_created",
      occurred_at: "2026-04-28T10:00:00.000Z",
      properties: {
        account_id: "account-1",
        user_id: "user-1",
        role: "owner",
        is_demo: true,
        sandbox_mode: "demo",
      },
    });
  });

  it("drops sensitive and unapproved analytics properties", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        account_id: "account-1",
        property_count: 2,
        has_overdue_payment: true,
        recipient_email: "tenant@example.com",
        phone: "+441234567890",
        document_filename: "passport.png",
        storage_path: "account/doc/file.png",
        signed_url: "https://example.com/signed",
        free_text_note: "Tenant said something private",
        source: "owner@example.com",
        random_property: "not in the contract",
      }),
    ).toEqual({
      account_id: "account-1",
      property_count: 2,
      has_overdue_payment: true,
    });
  });

  it("does not track unknown events", async () => {
    const sink = vi.fn();

    const result = await trackProductAnalyticsEvent(
      "surprise_dashboard_confetti",
      { account_id: "account-1" },
      { enabled: true, sink },
    );

    expect(result).toEqual({ queued: false, reason: "unknown_event" });
    expect(sink).not.toHaveBeenCalled();
  });

  it("is no-op safe when analytics is disabled", async () => {
    const sink = vi.fn();

    const result = await trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SIGNUP_STARTED,
      { source: "marketing" },
      { enabled: false, sink },
    );

    expect(result).toEqual({ queued: false, reason: "disabled" });
    expect(sink).not.toHaveBeenCalled();
  });

  it("swallows sink failures so analytics cannot break product flows", async () => {
    const sink = vi.fn().mockRejectedValue(new Error("analytics unavailable"));

    const result = await trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FINANCE_REVIEWED,
      { account_id: "account-1", has_overdue_payment: true },
      { enabled: true, sink },
    );

    expect(result).toEqual({ queued: false, reason: "sink_error" });
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
