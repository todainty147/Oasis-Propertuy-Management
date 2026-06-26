import { describe, expect, it } from "vitest";

import {
  CLASSIFICATIONS,
  REGULATORY_DATA_REQUIREMENTS,
  classifyInput,
  classifyTenancyReadiness,
} from "../../src/lib/regulatoryDataReadiness.js";

const baseContext = {
  regulatory: {
    regulatory_change_version: "rra-2026-05-01",
    impact_rule_version: "rra_info_sheet_v1.0",
    qualifying_date: "2026-05-01",
    notice_cutoff_date: "2026-04-30",
    official_info_sheet: {
      identity: "govuk-rra-info-sheet",
      version: "2026-05",
      hash: "sha256:abc123",
    },
  },
  lease: {
    id: "lease-1",
    lease_start_date: "2026-01-01",
    start_date: "2026-01-01",
    lease_end_date: "2026-12-31",
    end_date: "2026-12-31",
    rent_amount: 1500,
    rent_frequency: "monthly",
    is_wholly_oral: false,
    tenancy_class: "assured_shorthold",
    company_let: false,
    resident_landlord: false,
    rent_act_1977: false,
  },
  property: {
    country_subdivision: "ENG",
    pbsa: false,
  },
  renters_rights_task: {
    status: "sent",
    sent_at: "2026-05-02T10:00:00Z",
  },
};

describe("RPE VS-0 regulatory data catalogue", () => {
  it("contains exactly the 23 RRA information-sheet inputs", () => {
    expect(REGULATORY_DATA_REQUIREMENTS).toHaveLength(23);
    expect(new Set(REGULATORY_DATA_REQUIREMENTS.map((row) => row.input_key)).size).toBe(23);
  });

  it("seeds capture tiers for portfolio-captured common inputs", () => {
    const byKey = Object.fromEntries(REGULATORY_DATA_REQUIREMENTS.map((row) => [row.input_key, row]));

    expect(byKey.jurisdiction.capture_tier).toBe(1);
    expect(byKey.tenancy_start_date.capture_tier).toBe(2);
    expect(byKey.tenancy_end_date.capture_tier).toBe(2);
    expect(byKey.annual_rent_gbp.capture_tier).toBe(3);
    expect(byKey.company_let.capture_tier).toBe(4);
    expect(byKey.s21_served.capture_tier).toBe(5);
    expect(byKey.s21_served.conditional).toBe(true);
  });
});

describe("classifyInput", () => {
  it("returns exists with a value and source fields for structured fields", () => {
    const result = classifyInput("tenancy_start_date", baseContext);

    expect(result.classification).toBe(CLASSIFICATIONS.EXISTS);
    expect(result.value).toBe("2026-01-01");
    expect(result.source_fields).toEqual(["leases.lease_start_date"]);
    expect(result.confidence_basis).toBe("exists");
  });

  it("returns derivable with a computed value for annual rent", () => {
    const result = classifyInput("annual_rent_gbp", baseContext);

    expect(result.classification).toBe(CLASSIFICATIONS.DERIVABLE);
    expect(result.value).toBe(18000);
    expect(result.source_fields).toEqual(["leases.rent_amount", "leases.rent_frequency"]);
    expect(result.confidence_basis).toBe("derivable");
  });

  it("returns derivable for active_on_qualifying_date when all admissible dates are known", () => {
    const result = classifyInput("active_on_qualifying_date", baseContext);

    expect(result.classification).toBe(CLASSIFICATIONS.DERIVABLE);
    expect(result.value).toBe(true);
    expect(result.confidence_basis).toBe("derivable");
  });

  it("does not admit renters_rights_tasks.jurisdiction as property jurisdiction", () => {
    const result = classifyInput("jurisdiction", {
      renters_rights_task: { jurisdiction: "GB-ENG" },
      property: {},
      account: { country_code: "GB" },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
    expect(result.admissibility_reason).toMatch(/inadmissible/i);
  });

  it("does not admit properties.rent as a substitute for lease rent", () => {
    const result = classifyInput("annual_rent_gbp", {
      lease: { rent_amount: null, rent_frequency: null },
      property: { rent: 2000 },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.admissibility_reason).toMatch(/properties\.rent is an inadmissible substitute/i);
  });

  it("returns missing for unrecognised lease rent frequency", () => {
    const result = classifyInput("annual_rent_gbp", {
      lease: { rent_amount: 1500, rent_frequency: "lunar_cycle" },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
    expect(result.admissibility_reason).toMatch(/frequency is not recognised/i);
  });

  it("returns missing for active_on_qualifying_date when tenancy end date is absent", () => {
    const result = classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: {
        lease_start_date: "2026-01-01",
        start_date: "2026-01-01",
        lease_end_date: null,
        end_date: null,
      },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
    expect(result.admissibility_reason).toMatch(/no admissible time-qualified periodic\/open-ended indicator/i);
  });

  it("Record B: derives active_on_qualifying_date for null-end tenancies with an admissible time-qualified periodic indicator", () => {
    const result = classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: {
        lease_start_date: "2025-01-01",
        lease_end_date: null,
        term_type: "periodic",
        term_type_effective_from: "2025-01-01",
        term_type_evidence_basis: "agreement clause",
      },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.DERIVABLE);
    expect(result.value).toBe(true);
    expect(result.confidence_basis).toBe("derivable");
    expect(result.source_fields).toContain("leases.term_type_effective_from");
    expect(result.admissibility_reason).toMatch(/time-qualified periodic\/open-ended indicator/i);
  });

  it("derives active_on_qualifying_date for the canonical open_ended term_type value", () => {
    const result = classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: {
        lease_start_date: "2025-01-01",
        lease_end_date: null,
        term_type: "open_ended",
        term_type_effective_from: "2026-05-01",
        term_type_evidence_basis: "statutory_conversion",
      },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.DERIVABLE);
    expect(result.value).toBe(true);
    expect(result.source_fields).toEqual(expect.arrayContaining([
      "leases.term_type",
      "leases.term_type_effective_from",
      "leases.term_type_evidence_basis",
    ]));
  });

  it("rejects bare current-state term flags for active_on_qualifying_date", () => {
    const result = classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: {
        lease_start_date: "2025-01-01",
        lease_end_date: null,
        tenancy_term_type: "periodic",
        is_open_ended: true,
        renewal_status: "active",
      },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
    expect(result.admissibility_reason).toMatch(/Bare current-state/i);
  });

  it.each([
    [
      "C-bad-1 no effective date",
      {
        term_type: "periodic",
        term_type_effective_from: null,
        term_type_evidence_basis: "statutory_conversion",
      },
    ],
    [
      "C-bad-2 effective after qualifying date",
      {
        term_type: "periodic",
        term_type_effective_from: "2026-06-01",
        term_type_evidence_basis: "statutory_conversion",
      },
    ],
    [
      "C-bad-3 no evidence basis",
      {
        term_type: "periodic",
        term_type_effective_from: "2026-05-01",
        term_type_evidence_basis: null,
      },
    ],
    [
      "C-bad-4 fixed is not an open-ended/periodic indicator",
      {
        term_type: "fixed",
        term_type_effective_from: "2026-05-01",
        term_type_evidence_basis: "agreement_clause",
      },
    ],
    [
      "hyphenated open-ended is rejected because the schema only admits open_ended",
      {
        term_type: "open-ended",
        term_type_effective_from: "2026-05-01",
        term_type_evidence_basis: "agreement_clause",
      },
    ],
  ])("Record %s: rejects present but inadmissible term indicator", (_label, leasePatch) => {
    const result = classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: {
        lease_start_date: "2025-10-01",
        lease_end_date: null,
        ...leasePatch,
      },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.admissibility_reason).toMatch(/present but inadmissible/i);
    expect(result.admissibility_reason).not.toMatch(/absent/i);
  });

  it("derives active_on_qualifying_date false when start is after qualifying or end is before qualifying", () => {
    expect(classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: { lease_start_date: "2026-05-02", lease_end_date: "2027-01-01" },
    })).toMatchObject({
      classification: CLASSIFICATIONS.DERIVABLE,
      value: false,
    });

    expect(classifyInput("active_on_qualifying_date", {
      regulatory: { qualifying_date: "2026-05-01" },
      lease: { lease_start_date: "2025-01-01", lease_end_date: "2026-04-30" },
    })).toMatchObject({
      classification: CLASSIFICATIONS.DERIVABLE,
      value: false,
    });
  });

  it("treats agreeing dual dates or one populated date as exists", () => {
    expect(classifyInput("tenancy_start_date", {
      lease: { lease_start_date: "2026-01-01", start_date: "2026-01-01" },
    })).toMatchObject({
      classification: CLASSIFICATIONS.EXISTS,
      value: "2026-01-01",
      low_confidence_reason: null,
    });

    expect(classifyInput("tenancy_start_date", {
      lease: { lease_start_date: null, start_date: "2026-02-01" },
    })).toMatchObject({
      classification: CLASSIFICATIONS.EXISTS,
      value: "2026-02-01",
      low_confidence_reason: null,
    });
  });

  it("classifies conflicting dual dates as missing, never low confidence", () => {
    const result = classifyInput("tenancy_start_date", {
      lease: { lease_start_date: "2026-01-01", start_date: "2026-02-01" },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
    expect(result.low_confidence_reason).toBeNull();
    expect(result.admissibility_reason).toMatch(/Contradictory/);
  });

  it("classifies possession inputs as not_applicable when no structured notice signal exists", () => {
    for (const input of ["s21_served", "s8_served", "proceedings_status"]) {
      const result = classifyInput(input, {
        possession: { id: "proceeding-without-notice-signal" },
        document: { filename: "section-21-notice.pdf" },
        notes: "S21 served",
      });

      expect(result.classification).toBe(CLASSIFICATIONS.NOT_APPLICABLE);
      expect(result.value).toBeNull();
      expect(result.confidence_basis).toBeNull();
    }
  });

  it("classifies possession fields as missing only after an admissible notice signal exists", () => {
    const result = classifyInput("proceedings_status", {
      possession: { structuredNoticeSignal: true },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
  });

  it("classifies possession fields as exists when structured notice data is present", () => {
    const result = classifyInput("s21_served", {
      possession: { structuredNoticeSignal: true, s21_served_at: "2026-04-01" },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.EXISTS);
    expect(result.value).toBe("2026-04-01");
  });

  it("classifies Tier-4 boolean fields from their structured columns and preserves false as present", () => {
    const cases = [
      ["company_let", { lease: { company_let: false } }, "leases.company_let"],
      ["resident_landlord", { lease: { resident_landlord: false } }, "leases.resident_landlord"],
      ["rent_act_1977", { lease: { rent_act_1977: false } }, "leases.rent_act_1977"],
      ["is_wholly_oral", { lease: { is_wholly_oral: false } }, "leases.is_wholly_oral"],
      ["pbsa", { property: { pbsa: false } }, "properties.pbsa"],
    ];

    for (const [inputKey, context, sourceField] of cases) {
      const result = classifyInput(inputKey, context);
      expect(result.classification).toBe(CLASSIFICATIONS.EXISTS);
      expect(result.value).toBe(false);
      expect(result.source_fields).toEqual([sourceField]);
    }
  });

  it("keeps null Tier-4 boolean fields missing instead of treating them as false", () => {
    const result = classifyInput("company_let", {
      lease: { company_let: null },
      tenant: { company_let: false },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.source_fields).toEqual([]);
  });

  it("classifies tenancy_class from leases.tenancy_class and rejects lease_type as inadmissible", () => {
    expect(classifyInput("tenancy_class", {
      lease: { tenancy_class: "assured_shorthold" },
    })).toMatchObject({
      classification: CLASSIFICATIONS.EXISTS,
      value: "assured_shorthold",
      source_fields: ["leases.tenancy_class"],
    });

    const missingClass = classifyInput("tenancy_class", {
      lease: { tenancy_class: null, lease_type: "najem_okazjonalny" },
    });

    expect(missingClass.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(missingClass.value).toBeNull();
    expect(missingClass.admissibility_reason).toMatch(/inadmissible/i);
  });

  it("classifies jurisdiction as exists when country_subdivision is set (Record A — England proceeds)", () => {
    const result = classifyInput("jurisdiction", {
      property: { country_subdivision: "England" },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.EXISTS);
    expect(result.value).toBe("England");
    expect(result.source_fields).toEqual(["properties.country_subdivision"]);
    expect(result.confidence_basis).toBe("exists");
  });

  it("classifies non-England subdivisions identically (Record D — Wales/Scotland/NI fast-fail path)", () => {
    for (const subdivision of ["Wales", "Scotland", "Northern Ireland", "Other"]) {
      const result = classifyInput("jurisdiction", {
        property: { country_subdivision: subdivision },
      });

      expect(result.classification).toBe(CLASSIFICATIONS.EXISTS);
      expect(result.value).toBe(subdivision);
      expect(result.source_fields).toEqual(["properties.country_subdivision"]);
    }
  });

  it("returns missing when country_subdivision is null even with inadmissible sources present (§15 guard)", () => {
    const result = classifyInput("jurisdiction", {
      property: { market: "uk", country_subdivision: null },
      account: { country_code: "GB" },
      renters_rights_task: { jurisdiction: "GB-ENG" },
    });

    expect(result.classification).toBe(CLASSIFICATIONS.MISSING);
    expect(result.value).toBeNull();
    expect(result.confidence_basis).toBeNull();
    expect(result.admissibility_reason).toMatch(/inadmissible/i);
    expect(result.source_fields).toEqual(["properties.country_subdivision"]);
  });

  it("is pure and deterministic for the same context", () => {
    const first = classifyTenancyReadiness(baseContext);
    const second = classifyTenancyReadiness(baseContext);

    expect(second).toEqual(first);
  });

  it("never emits a value or confidence basis for missing/not_applicable results", () => {
    const map = classifyTenancyReadiness({
      lease: {
        lease_start_date: "2026-01-01",
        start_date: "2026-02-01",
      },
      possession: {},
    });

    for (const result of Object.values(map)) {
      if ([CLASSIFICATIONS.MISSING, CLASSIFICATIONS.NOT_APPLICABLE].includes(result.classification)) {
        expect(result.value).toBeNull();
        expect(result.confidence_basis).toBeNull();
      }
    }
  });
});
