import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAYMENT_COLLECTION_SETTINGS,
  assessPaymentCollectionSetup,
  normalizePaymentCollectionSettings,
} from "../../src/services/paymentCollectionSettingsService";

describe("payment collection settings service", () => {
  it("returns stable defaults when no row exists yet", () => {
    const settings = normalizePaymentCollectionSettings(null, "account-1");

    expect(settings).toEqual({
      ...DEFAULT_PAYMENT_COLLECTION_SETTINGS,
      account_id: "account-1",
    });
  });

  it("normalizes methods and statuses from backend rows", () => {
    const settings = normalizePaymentCollectionSettings({
      account_id: "account-1",
      collection_status: "external_portal",
      accepted_methods: ["bank_transfer", "external_card", "unknown"],
      instructions: " Pay using your tenancy reference. ",
      portal_url: "https://payments.example.test/pay",
      support_email: "billing@example.test",
      autopay_status: "external",
      autopay_instructions: " Standing order available. ",
    });

    expect(settings.collection_status).toBe("external_portal");
    expect(settings.accepted_methods).toEqual(["bank_transfer", "external_card"]);
    expect(settings.instructions).toBe("Pay using your tenancy reference.");
    expect(settings.autopay_status).toBe("external");
    expect(settings.autopay_instructions).toBe("Standing order available.");
  });

  it("marks setup as ready when the tenant payment path is fully configured", () => {
    const assessment = assessPaymentCollectionSetup({
      collection_status: "external_portal",
      accepted_methods: ["bank_transfer"],
      instructions: "Use your tenancy reference.",
      portal_url: "https://payments.example.test/pay",
      support_email: "billing@example.test",
      autopay_status: "external",
      autopay_instructions: "Contact support to enable autopay.",
    });

    expect(assessment.state).toBe("ready");
    expect(assessment.isReady).toBe(true);
    expect(assessment.requiredActions).toEqual([]);
  });

  it("flags missing payment setup details before tenant launch", () => {
    const assessment = assessPaymentCollectionSetup({
      collection_status: "external_portal",
      accepted_methods: [],
      instructions: "",
      portal_url: "",
      support_email: "",
      autopay_status: "external",
      autopay_instructions: "",
    });

    expect(assessment.state).toBe("needs_attention");
    expect(assessment.requiredActions).toEqual(
      expect.arrayContaining(["add_method", "add_instructions", "add_portal_url", "add_autopay_instructions"]),
    );
    expect(assessment.recommendedActions).toEqual(["add_support_email"]);
  });
});
