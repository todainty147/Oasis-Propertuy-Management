import { describe, expect, it } from "vitest";

import { classifyFollowUpPriority } from "../../src/services/earlyUsersService.js";

const NOW = new Date("2026-06-08T12:00:00.000Z");

function baseRow(overrides = {}) {
  return {
    signupType: "landlord_self_serve",
    signedUpAt: "2026-06-07T12:00:00.000Z",
    founderOfferStatus: "",
    feedbackOptIn: true,
    feedbackStatus: "not_contacted",
    activationEvents: {
      landlord_signup_completed: true,
    },
    ...overrides,
  };
}

describe("classifyFollowUpPriority", () => {
  it("marks users as do not contact when consent is missing or status says do not contact", () => {
    expect(classifyFollowUpPriority(baseRow({ feedbackOptIn: false }), { now: NOW }))
      .toBe("do_not_contact");
    expect(classifyFollowUpPriority(baseRow({ feedbackStatus: "do_not_contact" }), { now: NOW }))
      .toBe("do_not_contact");
  });

  it("marks recent founder users who consented as high priority", () => {
    expect(classifyFollowUpPriority(baseRow({
      founderOfferStatus: "qualified",
      signedUpAt: "2026-06-01T12:00:00.000Z",
    }), { now: NOW })).toBe("high_priority");
  });

  it("marks landlord signups with no activation beyond signup after 24 hours as needing help", () => {
    expect(classifyFollowUpPriority(baseRow({
      signedUpAt: "2026-06-06T11:59:00.000Z",
      activationEvents: { landlord_signup_completed: true },
    }), { now: NOW })).toBe("needs_help");
  });

  it("marks property plus companion activation as a warm lead", () => {
    expect(classifyFollowUpPriority(baseRow({
      signedUpAt: "2026-06-08T08:00:00.000Z",
      activationEvents: {
        landlord_signup_completed: true,
        first_property_created: true,
        first_tenant_created: true,
      },
    }), { now: NOW })).toBe("warm_lead");
  });

  it("falls back to not ready when no higher signal matches", () => {
    expect(classifyFollowUpPriority(baseRow({
      signedUpAt: "2026-06-08T08:00:00.000Z",
      activationEvents: { landlord_signup_completed: true },
    }), { now: NOW })).toBe("not_ready");
  });
});
