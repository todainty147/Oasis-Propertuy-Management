// Regulatory Proof Engine VS-0 — Data Readiness Layer
//
// This module is intentionally headless. It classifies admissible data for
// later regulatory evaluation, but it never evaluates legal status.

export const RRA_INFO_SHEET_RULE_REF = "rra_info_sheet_v1";

export const CLASSIFICATIONS = Object.freeze({
  EXISTS: "exists",
  DERIVABLE: "derivable",
  MISSING: "missing",
  NOT_APPLICABLE: "not_applicable",
});

export const CONFIDENCE_BASIS = Object.freeze({
  EXISTS: "exists",
  DERIVABLE: "derivable",
});

const INADMISSIBLE_REASONS = Object.freeze({
  OPERATIONAL_DEFAULT:
    "Operational defaults, hardcoded constants, free text, filenames, document tags, and account-level assumptions are inadmissible for VS-0.",
  MISSING:
    "No admissible structured source field is present for this input.",
  CONFLICT:
    "Contradictory structured source fields require data capture; VS-0 must not choose silently.",
  NOT_APPLICABLE:
    "Input is structurally defined but off this tenancy's current decision path.",
});

export const REGULATORY_DATA_REQUIREMENTS = Object.freeze([
  {
    input_key: "regulatory_change_version",
    capability: "missing",
    capture_tier: null,
    capture_location: "controlled regulatory catalogue",
    mandatory: true,
    conditional: false,
    source_fields: [],
    notes: "Delivered by regulatory_change at VS-1; not portfolio-captured.",
  },
  {
    input_key: "impact_rule_version",
    capability: "missing",
    capture_tier: null,
    capture_location: "controlled regulatory catalogue",
    mandatory: true,
    conditional: false,
    source_fields: [],
    notes: "Delivered by impact_rule at VS-1; not portfolio-captured.",
  },
  {
    input_key: "qualifying_date",
    capability: "missing",
    capture_tier: null,
    capture_location: "controlled regulatory catalogue",
    mandatory: true,
    conditional: false,
    source_fields: [],
    notes: "Commencement/qualifying date must come from a versioned rule record, not a code constant.",
  },
  {
    input_key: "tenancy_exists",
    capability: "exists",
    capture_tier: 2,
    capture_location: "tenancy setup",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.id"],
    notes: "A lease row is the structured tenancy record.",
  },
  {
    input_key: "tenancy_start_date",
    capability: "exists",
    capture_tier: 2,
    capture_location: "tenancy setup",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.lease_start_date", "leases.start_date"],
    notes: "Dual nullable columns are accepted only when one is populated or both agree.",
  },
  {
    input_key: "tenancy_end_date",
    capability: "exists",
    capture_tier: 2,
    capture_location: "tenancy setup",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.lease_end_date", "leases.end_date"],
    notes: "Null is not proof of an ongoing tenancy until an explicit semantic contract exists.",
  },
  {
    input_key: "active_on_qualifying_date",
    capability: "derivable",
    capture_tier: 2,
    capture_location: "tenancy setup / time-qualified term review",
    mandatory: true,
    conditional: false,
    source_fields: [
      "leases.lease_start_date",
      "leases.start_date",
      "leases.lease_end_date",
      "leases.end_date",
      "regulatory.qualifying_date",
      "leases.term_type",
      "leases.term_type_effective_from",
      "leases.term_type_evidence_basis",
    ],
    notes: "Derived from admissible tenancy dates plus the versioned qualifying date. Null-end tenancies require a time-qualified periodic/open-ended indicator effective on or before the qualifying date.",
  },
  {
    input_key: "jurisdiction",
    capability: "exists",
    capture_tier: 1,
    capture_location: "property setup",
    mandatory: true,
    conditional: false,
    source_fields: ["properties.country_subdivision"],
    notes: "Property-level UK subdivision. Account GB, property market uk, and task jurisdiction defaults remain inadmissible (§15).",
  },
  {
    input_key: "annual_rent_gbp",
    capability: "derivable",
    capture_tier: 3,
    capture_location: "tenancy rent terms",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.rent_amount", "leases.rent_frequency"],
    notes: "properties.rent is an inadmissible substitute for lease rent.",
  },
  {
    input_key: "company_let",
    capability: "exists",
    capture_tier: 4,
    capture_location: "tenancy parties workflow",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.company_let"],
    notes: "Structured contracting-party legal-person exclusion flag. Null means unknown, not false.",
  },
  {
    input_key: "resident_landlord",
    capability: "exists",
    capture_tier: 4,
    capture_location: "tenancy setup/review",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.resident_landlord"],
    notes: "Structured resident-landlord/lodger exclusion flag. Null means unknown, not false.",
  },
  {
    input_key: "is_wholly_oral",
    capability: "exists",
    capture_tier: 4,
    capture_location: "tenancy setup/review",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.is_wholly_oral"],
    notes: "Structured obligation selector: true selects written_statement; false selects information_sheet.",
  },
  {
    input_key: "tenancy_class",
    capability: "exists",
    capture_tier: 4,
    capture_location: "tenancy setup/review",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.tenancy_class"],
    notes: "Provisional UK tenancy classification value set; Existing Polish lease_type values are inadmissible.",
  },
  {
    input_key: "rent_act_1977",
    capability: "exists",
    capture_tier: 4,
    capture_location: "tenancy setup/review",
    mandatory: true,
    conditional: false,
    source_fields: ["leases.rent_act_1977"],
    notes: "Structured Rent Act 1977 exclusion flag. Null means unknown, not false.",
  },
  {
    input_key: "pbsa",
    capability: "exists",
    capture_tier: 4,
    capture_location: "property and tenancy setup/review",
    mandatory: true,
    conditional: false,
    source_fields: ["properties.pbsa"],
    notes: "Structured property-level PBSA/excluded accommodation flag. Null means unknown, not false.",
  },
  {
    input_key: "s21_served",
    capability: "missing",
    capture_tier: 5,
    capture_location: "possession notice workflow",
    mandatory: true,
    conditional: true,
    source_fields: [],
    notes: "Conditional possession input. No structured notice signal means not_applicable per tenancy.",
  },
  {
    input_key: "s8_served",
    capability: "missing",
    capture_tier: 5,
    capture_location: "possession notice workflow",
    mandatory: true,
    conditional: true,
    source_fields: [],
    notes: "Conditional possession input. No structured notice signal means not_applicable per tenancy.",
  },
  {
    input_key: "notice_cutoff_date",
    capability: "missing",
    capture_tier: null,
    capture_location: "controlled regulatory catalogue",
    mandatory: true,
    conditional: false,
    source_fields: [],
    notes: "Delivered by the versioned rule catalogue, not by portfolio data.",
  },
  {
    input_key: "proceedings_status",
    capability: "missing",
    capture_tier: 5,
    capture_location: "possession/court proceeding workflow",
    mandatory: true,
    conditional: true,
    source_fields: [],
    notes: "Conditional possession input. Missing only once an admissible notice signal exists.",
  },
  {
    input_key: "official_info_sheet_identity",
    capability: "missing",
    capture_tier: null,
    capture_location: "controlled document catalogue/template registry",
    mandatory: true,
    conditional: false,
    source_fields: [],
    notes: "Requires official GOV.UK artefact identity/version/hash; document tags or filenames are inadmissible.",
  },
  {
    input_key: "information_sheet_served",
    capability: "exists",
    capture_tier: null,
    capture_location: "document service/provenance workflow",
    mandatory: true,
    conditional: false,
    source_fields: ["renters_rights_tasks.status", "renters_rights_tasks.sent_at", "provenance_events"],
    notes: "Operational service evidence can exist, but does not by itself evaluate legal compliance.",
  },
  {
    input_key: "service_evidence_timestamp",
    capability: "exists",
    capture_tier: null,
    capture_location: "document service/provenance workflow",
    mandatory: true,
    conditional: false,
    source_fields: ["renters_rights_tasks.sent_at", "provenance_events.occurred_at", "provenance_events.recorded_at"],
    notes: "Timestamp strength depends on evidence type; VS-0 only classifies the source.",
  },
  {
    input_key: "evaluation_outcome_record",
    capability: "missing",
    capture_tier: null,
    capture_location: "regulatory engine output",
    mandatory: true,
    conditional: false,
    source_fields: [],
    notes: "Placeholder for VS-1+ persisted evaluation/obligation output. VS-0 must not write it.",
  },
]);

const REQUIREMENT_BY_KEY = new Map(
  REGULATORY_DATA_REQUIREMENTS.map((requirement) => [requirement.input_key, requirement]),
);

export function getRegulatoryDataRequirement(inputKey) {
  return REQUIREMENT_BY_KEY.get(inputKey) ?? null;
}

export function listRegulatoryDataRequirements() {
  return [...REGULATORY_DATA_REQUIREMENTS];
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function normalizeDate(value) {
  if (!hasValue(value)) return null;
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function base(inputKey) {
  const requirement = getRegulatoryDataRequirement(inputKey);
  return {
    input_key: inputKey,
    classification: CLASSIFICATIONS.MISSING,
    value: null,
    source_fields: [],
    admissibility_reason: INADMISSIBLE_REASONS.MISSING,
    confidence_basis: null,
    low_confidence_reason: null,
    capture_tier: requirement?.capture_tier ?? null,
    capture_location: requirement?.capture_location ?? null,
  };
}

function exists(inputKey, value, sourceFields, reason = "Admissible structured field is present.") {
  return {
    ...base(inputKey),
    classification: CLASSIFICATIONS.EXISTS,
    value,
    source_fields: sourceFields,
    admissibility_reason: reason,
    confidence_basis: CONFIDENCE_BASIS.EXISTS,
  };
}

function derivable(inputKey, value, sourceFields, reason = "Value is deterministically derived from admissible structured fields.") {
  return {
    ...base(inputKey),
    classification: CLASSIFICATIONS.DERIVABLE,
    value,
    source_fields: sourceFields,
    admissibility_reason: reason,
    confidence_basis: CONFIDENCE_BASIS.DERIVABLE,
  };
}

function missing(inputKey, reason = INADMISSIBLE_REASONS.MISSING, sourceFields = []) {
  return {
    ...base(inputKey),
    classification: CLASSIFICATIONS.MISSING,
    value: null,
    source_fields: sourceFields,
    admissibility_reason: reason,
    confidence_basis: null,
    low_confidence_reason: null,
  };
}

function notApplicable(inputKey, reason = INADMISSIBLE_REASONS.NOT_APPLICABLE) {
  return {
    ...base(inputKey),
    classification: CLASSIFICATIONS.NOT_APPLICABLE,
    value: null,
    source_fields: [],
    admissibility_reason: reason,
    confidence_basis: null,
    low_confidence_reason: null,
  };
}

function resolveDualDate(primary, legacy, primaryField, legacyField, inputKey) {
  const primaryDate = normalizeDate(primary);
  const legacyDate = normalizeDate(legacy);

  if (primaryDate && legacyDate && primaryDate !== legacyDate) {
    return missing(inputKey, INADMISSIBLE_REASONS.CONFLICT, [primaryField, legacyField]);
  }

  if (primaryDate) return exists(inputKey, primaryDate, [primaryField]);
  if (legacyDate) return exists(inputKey, legacyDate, [legacyField]);
  return missing(inputKey);
}

function getDateResultValue(result) {
  return result.classification === CLASSIFICATIONS.EXISTS ? result.value : null;
}

function hasAdmissibleOpenEndedIndicator(lease, qualifyingDate) {
  const termType = String(lease?.term_type ?? "").trim().toLowerCase();
  const effectiveFrom = normalizeDate(lease?.term_type_effective_from);
  const evidenceBasis = lease?.term_type_evidence_basis;

  if (!["periodic", "open_ended"].includes(termType)) return false;
  if (!effectiveFrom || effectiveFrom > qualifyingDate) return false;
  if (!hasValue(evidenceBasis)) return false;
  return true;
}

function hasStructuredTermIndicatorAttempt(lease) {
  return hasValue(lease?.term_type)
    || hasValue(lease?.term_type_effective_from)
    || hasValue(lease?.term_type_evidence_basis);
}

function missingOpenEndedIndicatorReason(lease) {
  if (hasStructuredTermIndicatorAttempt(lease)) {
    return "Term-type indicator is present but inadmissible: it must be periodic/open_ended, effective on or before the qualifying date, and supported by evidence basis.";
  }

  if (lease?.renewal_status || lease?.is_open_ended) {
    return "Bare current-state term/open-ended flags are inadmissible without term_type_effective_from <= qualifying date and evidence basis.";
  }

  return "End date is absent and no admissible time-qualified periodic/open-ended indicator is present.";
}

function hasStructuredNoticeSignal(context) {
  const possession = context?.possession ?? {};
  return Boolean(possession.structuredNoticeSignal || possession.structured_notice_signal);
}

function classifyStructuredBoolean(inputKey, value, sourceField) {
  const bool = normalizeBoolean(value);
  if (bool === null) return missing(inputKey);
  return exists(inputKey, bool, [sourceField]);
}

export function classifyInput(inputKey, context = {}) {
  const lease = context.lease ?? {};
  const property = context.property ?? {};
  const regulatory = context.regulatory ?? {};
  const possession = context.possession ?? {};
  const task = context.renters_rights_task ?? context.rentersRightsTask ?? {};
  const evidence = context.evidence ?? {};

  switch (inputKey) {
    case "regulatory_change_version":
      return hasValue(regulatory.regulatory_change_version)
        ? exists(inputKey, String(regulatory.regulatory_change_version), ["regulatory_change.version"])
        : missing(inputKey, "No versioned regulatory_change record is present.");

    case "impact_rule_version":
      return hasValue(regulatory.impact_rule_version)
        ? exists(inputKey, String(regulatory.impact_rule_version), ["impact_rule.version"])
        : missing(inputKey, "No versioned impact_rule record is present.");

    case "qualifying_date": {
      const qualifyingDate = normalizeDate(regulatory.qualifying_date);
      return qualifyingDate
        ? exists(inputKey, qualifyingDate, ["regulatory.qualifying_date"])
        : missing(inputKey, "No versioned qualifying date is present.");
    }

    case "tenancy_exists":
      return hasValue(lease.id)
        ? exists(inputKey, true, ["leases.id"])
        : missing(inputKey);

    case "tenancy_start_date":
      return resolveDualDate(
        lease.lease_start_date,
        lease.start_date,
        "leases.lease_start_date",
        "leases.start_date",
        inputKey,
      );

    case "tenancy_end_date":
      return resolveDualDate(
        lease.lease_end_date,
        lease.end_date,
        "leases.lease_end_date",
        "leases.end_date",
        inputKey,
      );

    case "active_on_qualifying_date": {
      const startResult = classifyInput("tenancy_start_date", context);
      const endResult = classifyInput("tenancy_end_date", context);
      const start = getDateResultValue(startResult);
      const end = getDateResultValue(endResult);
      const qualifying = normalizeDate(regulatory.qualifying_date);

      if (!start || !qualifying) return missing(inputKey);
      if (startResult.admissibility_reason === INADMISSIBLE_REASONS.CONFLICT) {
        return missing(inputKey, INADMISSIBLE_REASONS.CONFLICT, startResult.source_fields);
      }
      if (endResult.admissibility_reason === INADMISSIBLE_REASONS.CONFLICT) {
        return missing(inputKey, INADMISSIBLE_REASONS.CONFLICT, endResult.source_fields);
      }

      if (start > qualifying) {
        return derivable(
          inputKey,
          false,
          ["leases.lease_start_date", "leases.start_date", "regulatory.qualifying_date"],
          "Start date is after the qualifying date, derived from admissible structured fields.",
        );
      }

      if (end) {
        return derivable(
          inputKey,
          end >= qualifying,
          ["leases.lease_start_date", "leases.start_date", "leases.lease_end_date", "leases.end_date", "regulatory.qualifying_date"],
        );
      }

      if (hasAdmissibleOpenEndedIndicator(lease, qualifying)) {
        return derivable(
          inputKey,
          true,
          [
            "leases.lease_start_date",
            "leases.start_date",
            "regulatory.qualifying_date",
            "leases.term_type",
            "leases.term_type_effective_from",
            "leases.term_type_evidence_basis",
          ],
          "Null end date is supported by an admissible time-qualified periodic/open-ended indicator as at the qualifying date.",
        );
      }

      return missing(
        inputKey,
        missingOpenEndedIndicatorReason(lease),
        [
          "leases.lease_end_date",
          "leases.end_date",
          "leases.term_type",
          "leases.term_type_effective_from",
          "leases.term_type_evidence_basis",
        ],
      );
    }

    case "jurisdiction": {
      const subdivision = property.country_subdivision;
      if (hasValue(subdivision)) {
        return exists(inputKey, String(subdivision), ["properties.country_subdivision"]);
      }
      return missing(
        inputKey,
        property.market || context.account?.country_code || task.jurisdiction
          ? INADMISSIBLE_REASONS.OPERATIONAL_DEFAULT
          : INADMISSIBLE_REASONS.MISSING,
        ["properties.country_subdivision"],
      );
    }

    case "annual_rent_gbp": {
      if (!hasValue(lease.rent_amount) || !hasValue(lease.rent_frequency)) {
        return missing(
          inputKey,
          property.rent ? "properties.rent is an inadmissible substitute for lease rent." : INADMISSIBLE_REASONS.MISSING,
          ["leases.rent_amount", "leases.rent_frequency"],
        );
      }
      const amount = Number(lease.rent_amount);
      if (!Number.isFinite(amount) || amount < 0) return missing(inputKey);
      const frequency = String(lease.rent_frequency).toLowerCase();
      const multiplier = {
        weekly: 52,
        week: 52,
        monthly: 12,
        month: 12,
        quarterly: 4,
        quarter: 4,
        annually: 1,
        annual: 1,
        yearly: 1,
        year: 1,
      }[frequency];
      if (!multiplier) return missing(inputKey, "Lease rent frequency is not recognised.", ["leases.rent_frequency"]);
      return derivable(inputKey, amount * multiplier, ["leases.rent_amount", "leases.rent_frequency"]);
    }

    case "is_wholly_oral":
      return classifyStructuredBoolean(inputKey, lease.is_wholly_oral, "leases.is_wholly_oral");

    case "company_let":
      return classifyStructuredBoolean(inputKey, lease.company_let, "leases.company_let");

    case "resident_landlord":
      return classifyStructuredBoolean(inputKey, lease.resident_landlord, "leases.resident_landlord");

    case "rent_act_1977":
      return classifyStructuredBoolean(inputKey, lease.rent_act_1977, "leases.rent_act_1977");

    case "pbsa":
      return classifyStructuredBoolean(inputKey, property.pbsa, "properties.pbsa");

    case "tenancy_class":
      if (hasValue(lease.tenancy_class)) return exists(inputKey, String(lease.tenancy_class), ["leases.tenancy_class"]);
      return missing(
        inputKey,
        lease.lease_type ? "leases.lease_type contains non-UK/Polish classifications and is inadmissible for RRA tenancy class." : INADMISSIBLE_REASONS.MISSING,
        ["leases.tenancy_class"],
      );

    case "s21_served":
      if (!hasStructuredNoticeSignal(context)) return notApplicable(inputKey, "No admissible structured Section 21 notice signal exists for this tenancy.");
      return hasValue(possession.s21_served_at)
        ? exists(inputKey, normalizeDate(possession.s21_served_at), ["possession_notices.s21_served_at"])
        : missing(inputKey, "Structured notice signal exists but Section 21 service timestamp is absent.", ["possession_notices.s21_served_at"]);

    case "s8_served":
      if (!hasStructuredNoticeSignal(context)) return notApplicable(inputKey, "No admissible structured Section 8 notice signal exists for this tenancy.");
      return hasValue(possession.s8_served_at)
        ? exists(inputKey, normalizeDate(possession.s8_served_at), ["possession_notices.s8_served_at"])
        : missing(inputKey, "Structured notice signal exists but Section 8 service timestamp is absent.", ["possession_notices.s8_served_at"]);

    case "notice_cutoff_date": {
      const cutoff = normalizeDate(regulatory.notice_cutoff_date);
      return cutoff
        ? exists(inputKey, cutoff, ["impact_rule.notice_cutoff_date"])
        : missing(inputKey, "No versioned notice cutoff date is present.");
    }

    case "proceedings_status":
      if (!hasStructuredNoticeSignal(context)) return notApplicable(inputKey, "No admissible structured possession notice signal exists for this tenancy.");
      return hasValue(possession.proceedings_status)
        ? exists(inputKey, String(possession.proceedings_status), ["possession_proceedings.status"])
        : missing(inputKey, "Structured notice signal exists but proceedings status is absent.", ["possession_proceedings.status"]);

    case "official_info_sheet_identity": {
      const official = regulatory.official_info_sheet ?? {};
      if (hasValue(official.identity) && hasValue(official.version) && hasValue(official.hash)) {
        return exists(
          inputKey,
          { identity: official.identity, version: official.version, hash: official.hash },
          ["official_document_catalogue.identity", "official_document_catalogue.version", "official_document_catalogue.hash"],
        );
      }
      return missing(inputKey, "No controlled official information-sheet identity/version/hash is present.");
    }

    case "information_sheet_served":
      if (evidence.information_sheet_served === true || task.status === "sent" || task.status === "evidence_uploaded" || task.status === "reviewed") {
        return exists(inputKey, true, evidence.information_sheet_served ? ["provenance_events"] : ["renters_rights_tasks.status"]);
      }
      return missing(inputKey);

    case "service_evidence_timestamp": {
      const timestamp = evidence.occurred_at ?? evidence.recorded_at ?? task.sent_at;
      return hasValue(timestamp)
        ? exists(inputKey, String(timestamp), evidence.occurred_at ? ["provenance_events.occurred_at"] : ["renters_rights_tasks.sent_at"])
        : missing(inputKey);
    }

    case "evaluation_outcome_record":
      return missing(inputKey, "No VS-1+ rule_evaluation or obligation_instance outcome record exists. VS-0 must not create one.");

    default:
      throw new Error(`Unknown regulatory input key: ${inputKey}`);
  }
}

export function classifyTenancyReadiness(context = {}) {
  return Object.fromEntries(
    REGULATORY_DATA_REQUIREMENTS.map((requirement) => [
      requirement.input_key,
      classifyInput(requirement.input_key, context),
    ]),
  );
}
