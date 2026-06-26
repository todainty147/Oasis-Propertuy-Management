import { spawnSync } from "node:child_process";

import {
  deriveEvaluationConfidence,
  evaluateRraInfoSheetV1,
} from "../../src/lib/regulatoryProofEngine.js";

const CONTAINER = process.env.RPE_DB_CONTAINER || "supabase_db_oasisrentalmanagementapp";

const IDS = Object.freeze({
  ownerA: "9f7e9d2a-0000-4e1a-9000-000000000101",
  ownerB: "9f7e9d2a-0000-4e1a-9000-000000000102",
  accountA: "9f7e9d2a-0000-4e1a-9000-000000000001",
  accountB: "9f7e9d2a-0000-4e1a-9000-000000000002",
  propertyT1: "9f7e9d2a-0000-4e1a-9000-000000000201",
  propertyT2: "9f7e9d2a-0000-4e1a-9000-000000000202",
  tenantT1: "9f7e9d2a-0000-4e1a-9000-000000000301",
  tenantT2: "9f7e9d2a-0000-4e1a-9000-000000000302",
  leaseT1: "9f7e9d2a-0000-4e1a-9000-000000000401",
  leaseT2: "9f7e9d2a-0000-4e1a-9000-000000000402",
});

function psql(sql, { json = false } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-X",
    "-q",
  ];

  if (json) args.push("-t", "-A");
  args.push("-f", "-");

  const result = spawnSync("docker", args, {
    input: sql,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      "psql failed",
      result.stdout,
      result.stderr,
      "SQL:",
      sql,
    ].filter(Boolean).join("\n"));
  }

  const out = result.stdout.trim();
  if (!json) return out;

  const jsonLine = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") || line.startsWith("[") || line === "null");

  return JSON.parse(jsonLine || "null");
}

function asUserSql(userId, bodySql) {
  return `
    select set_config('request.jwt.claim.sub', '${userId}', false);
    ${bodySql}
  `;
}

function seedSql() {
  return `
    begin;

    delete from public.rule_evaluation
     where tenancy_id in ('${IDS.leaseT1}', '${IDS.leaseT2}');

    delete from public.provenance_events
     where account_id in ('${IDS.accountA}', '${IDS.accountB}')
       and (
         event_type like 'rpe.capture.%'
         or event_type = 'evaluation_run'
         or entity_id in ('${IDS.leaseT1}', '${IDS.leaseT2}', '${IDS.propertyT1}', '${IDS.propertyT2}')
       );

    delete from public.leases where id in ('${IDS.leaseT1}', '${IDS.leaseT2}');
    delete from public.tenants where id in ('${IDS.tenantT1}', '${IDS.tenantT2}');
    delete from public.properties where id in ('${IDS.propertyT1}', '${IDS.propertyT2}');
    delete from public.account_members where account_id in ('${IDS.accountA}', '${IDS.accountB}');
    delete from public.accounts where id in ('${IDS.accountA}', '${IDS.accountB}');

    insert into auth.users (id, email)
    values
      ('${IDS.ownerA}', 'rpe-vs2a-owner-a@example.test'),
      ('${IDS.ownerB}', 'rpe-vs2a-owner-b@example.test')
    on conflict (id) do update
    set email = excluded.email;

    insert into public.accounts (id, name, created_by, language, country_code, currency, default_market)
    values
      ('${IDS.accountA}', 'RPE VS2A Closure Account A', '${IDS.ownerA}', 'en', 'GB', 'GBP', 'uk'),
      ('${IDS.accountB}', 'RPE VS2A Closure Account B', '${IDS.ownerB}', 'en', 'GB', 'GBP', 'uk')
    on conflict (id) do update
    set name = excluded.name,
        created_by = excluded.created_by,
        language = excluded.language,
        country_code = excluded.country_code,
        currency = excluded.currency,
        default_market = excluded.default_market;

    insert into public.account_members (account_id, user_id, role)
    values
      ('${IDS.accountA}', '${IDS.ownerA}', 'owner'),
      ('${IDS.accountB}', '${IDS.ownerB}', 'owner')
    on conflict (account_id, user_id) do update
    set role = excluded.role;

    insert into public.properties (id, owner_id, address, city, tenant_id, status, rent, size, account_id, market, country_subdivision, pbsa)
    values
      ('${IDS.propertyT1}', '${IDS.ownerA}', 'RPE_VS2A_T1_C_SHAPED', 'London', null, 'Wolne', 1200, 'diagnostic', '${IDS.accountA}', 'uk', 'England', null),
      ('${IDS.propertyT2}', '${IDS.ownerA}', 'RPE_VS2A_T2_JURISDICTION_BLOCKED', 'London', null, 'Wolne', 1200, 'diagnostic', '${IDS.accountA}', 'uk', null, null);

    insert into public.tenants (id, owner_id, property_id, name, email, account_id, status)
    values
      ('${IDS.tenantT1}', '${IDS.ownerA}', '${IDS.propertyT1}', 'RPE VS2A Tenant T1', 'rpe-vs2a-t1@example.test', '${IDS.accountA}', 'active'),
      ('${IDS.tenantT2}', '${IDS.ownerA}', '${IDS.propertyT2}', 'RPE VS2A Tenant T2', 'rpe-vs2a-t2@example.test', '${IDS.accountA}', 'active');

    insert into public.leases (
      id,
      account_id,
      property_id,
      tenant_id,
      status,
      start_date,
      end_date,
      rent_amount,
      rent_frequency,
      created_by,
      lease_start_date,
      lease_end_date,
      renewal_status,
      notice_period_days,
      auto_renew,
      notes,
      term_type,
      term_type_effective_from,
      term_type_evidence_basis,
      company_let,
      resident_landlord,
      rent_act_1977,
      is_wholly_oral,
      tenancy_class
    )
    values
      (
        '${IDS.leaseT1}', '${IDS.accountA}', '${IDS.propertyT1}', '${IDS.tenantT1}',
        'active', '2025-10-01', null, 1200, 'monthly', '${IDS.ownerA}',
        '2025-10-01', null, 'active', 30, false,
        'RPE VS2A closure C-shaped test lease',
        null, null, null, null, null, null, null, null
      ),
      (
        '${IDS.leaseT2}', '${IDS.accountA}', '${IDS.propertyT2}', '${IDS.tenantT2}',
        'active', '2025-10-01', null, 1200, 'monthly', '${IDS.ownerA}',
        '2025-10-01', null, 'active', 30, false,
        'RPE VS2A closure jurisdiction-blocked test lease',
        null, null, null, null, null, null, null, null
      );

    commit;
  `;
}

function getStoredState() {
  return psql(`
    select jsonb_build_object(
      't1_property', (select to_jsonb(p) from public.properties p where p.id = '${IDS.propertyT1}'),
      't2_property', (select to_jsonb(p) from public.properties p where p.id = '${IDS.propertyT2}'),
      't1_lease', (select to_jsonb(l) from public.leases l where l.id = '${IDS.leaseT1}'),
      't2_lease', (select to_jsonb(l) from public.leases l where l.id = '${IDS.leaseT2}'),
      'capture_events', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pe.id,
          'event_type', pe.event_type,
          'entity_id', pe.entity_id,
          'actor_user_id', pe.actor_user_id,
          'metadata', pe.metadata
        ) order by pe.recorded_at), '[]'::jsonb)
        from public.provenance_events pe
        where pe.account_id = '${IDS.accountA}'
          and pe.event_type like 'rpe.capture.%'
      ),
      'owner_b_capture_events_against_owner_a', (
        select count(*)
        from public.provenance_events pe
        where pe.account_id = '${IDS.accountA}'
          and pe.event_type like 'rpe.capture.%'
          and pe.actor_user_id = '${IDS.ownerB}'
      ),
      'term_capture_events', (
        select count(*)
        from public.provenance_events pe
        where pe.account_id = '${IDS.accountA}'
          and pe.event_type = 'rpe.capture.term_indicator_confirmed'
          and pe.entity_id = '${IDS.leaseT1}'
      ),
      'latest_t1_evaluation', (
        select to_jsonb(re)
        from public.rule_evaluation re
        where re.tenancy_id = '${IDS.leaseT1}'
        order by re.evaluated_at desc
        limit 1
      ),
      'latest_t2_evaluation', (
        select to_jsonb(re)
        from public.rule_evaluation re
        where re.tenancy_id = '${IDS.leaseT2}'
        order by re.evaluated_at desc
        limit 1
      )
    )::text;
  `, { json: true });
}

function callRpcAs(userId, rpcSql) {
  try {
    const data = psql(asUserSql(userId, `
      select jsonb_build_object('ok', true, 'data', (${rpcSql})::jsonb)::text;
    `), { json: true });
    return { ok: true, data: data.data };
  } catch (error) {
    return {
      ok: false,
      message: String(error.message || error),
    };
  }
}

function loadVs0Map(leaseId) {
  const rows = psql(asUserSql(IDS.ownerA, `
    select coalesce(jsonb_object_agg(input_key, classified_input), '{}'::jsonb)::text
    from public.get_rra_info_sheet_data_readiness('${IDS.accountA}', '${leaseId}');
  `), { json: true });
  return rows;
}

function loadImpactRule() {
  return psql(`
    select to_jsonb(ir)::text
    from public.impact_rule ir
    where ir.rule_key = 'rra_info_sheet_v1'
      and ir.version = 1
    limit 1;
  `, { json: true });
}

function recordEvaluation(leaseId) {
  const impactRule = loadImpactRule();
  const inputSnapshot = loadVs0Map(leaseId);
  const evaluated = evaluateRraInfoSheetV1(inputSnapshot);
  const evaluationConfidence = deriveEvaluationConfidence(inputSnapshot, evaluated.decision_path, evaluated.result);
  const evaluatedAt = new Date().toISOString();

  const payload = psql(asUserSql(IDS.ownerA, `
    select to_jsonb(public.record_rra_info_sheet_rule_evaluation(
      '${IDS.accountA}'::uuid,
      '${leaseId}'::uuid,
      '${JSON.stringify(inputSnapshot).replaceAll("'", "''")}'::jsonb,
      array[${evaluated.decision_path.map((item) => `'${item.replaceAll("'", "''")}'`).join(",")}]::text[],
      '${evaluated.result}'::text,
      ${evaluated.obligation_kind ? `'${evaluated.obligation_kind}'::text` : "null::text"},
      ${evaluated.exposure_gbp_ceiling ?? "null"}::numeric,
      array[${evaluated.reason_codes.map((item) => `'${item.replaceAll("'", "''")}'`).join(",")}]::text[],
      array[${evaluated.missing_fields.map((item) => `'${item.replaceAll("'", "''")}'`).join(",")}]::text[],
      ${evaluated.deferred_until ? `'${evaluated.deferred_until}'::date` : "null::date"},
      ${evaluated.deferred_until_basis ? `'${evaluated.deferred_until_basis}'::text` : "null::text"},
      ${evaluationConfidence ? `'${evaluationConfidence}'::text` : "null::text"},
      true,
      '${evaluatedAt}'::timestamptz
    ))::text;
  `), { json: true });

  return {
    id: payload.id,
    result: evaluated.result,
    aod_branch: evaluated.aod_branch,
    reason_codes: evaluated.reason_codes,
    missing_fields: evaluated.missing_fields,
    evaluation_confidence: evaluationConfidence,
    input_snapshot: inputSnapshot,
    evaluated_at: evaluatedAt,
  };
}

function getCaptureReadiness(leaseId) {
  return psql(asUserSql(IDS.ownerA, `
    select public.get_rra_capture_readiness('${IDS.accountA}', '${leaseId}')::text;
  `), { json: true });
}

function captureJurisdiction(propertyId, countrySubdivision) {
  return callRpcAs(IDS.ownerA, `
    public.capture_rra_jurisdiction(
      '${IDS.accountA}'::uuid,
      '${propertyId}'::uuid,
      '${countrySubdivision}'::text,
      'VS2A closure diagnostic basis'::text,
      true
    )
  `);
}

function captureTerm({ userId = IDS.ownerA, termType, effectiveFrom, evidenceBasis }) {
  const basisSql = evidenceBasis === null ? "null::text" : `'${evidenceBasis.replaceAll("'", "''")}'::text`;
  return callRpcAs(userId, `
    public.capture_rra_term_indicator(
      '${IDS.accountA}'::uuid,
      '${IDS.leaseT1}'::uuid,
      '${termType}'::text,
      '${effectiveFrom}'::date,
      ${basisSql},
      true
    )
  `);
}

function captureTier4() {
  return callRpcAs(IDS.ownerA, `
    public.capture_rra_tier4_classification(
      '${IDS.accountA}'::uuid,
      '${IDS.leaseT1}'::uuid,
      'assured_shorthold'::text,
      false,
      false,
      false,
      false,
      false,
      'VS2A closure diagnostic tier4 basis'::text,
      true
    )
  `);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesOnlyMissing(evaluation, missingField) {
  return evaluation.result === "needs_data" && evaluation.missing_fields.includes(missingField);
}

async function main() {
  psql(seedSql());

  const initialT1 = recordEvaluation(IDS.leaseT1);
  const initialT2 = recordEvaluation(IDS.leaseT2);
  const before = getStoredState();

  assert(includesOnlyMissing(initialT1, "active_on_qualifying_date"), "T1 should initially need active_on_qualifying_date");
  assert(includesOnlyMissing(initialT2, "jurisdiction"), "T2 should initially need jurisdiction");

  const authAttempts = {
    jurisdiction: callRpcAs(IDS.ownerB, `
      public.capture_rra_jurisdiction(
        '${IDS.accountA}'::uuid,
        '${IDS.propertyT1}'::uuid,
        'Wales'::text,
        'malicious cross-account attempt'::text,
        true
      )
    `),
    term_indicator: captureTerm({
      userId: IDS.ownerB,
      termType: "periodic",
      effectiveFrom: "2026-05-01",
      evidenceBasis: "malicious cross-account attempt",
    }),
    tier4: callRpcAs(IDS.ownerB, `
      public.capture_rra_tier4_classification(
        '${IDS.accountA}'::uuid,
        '${IDS.leaseT1}'::uuid,
        'assured_shorthold'::text,
        false,
        false,
        false,
        false,
        false,
        'malicious cross-account attempt'::text,
        true
      )
    `),
  };

  const afterAuth = getStoredState();
  assert(Object.values(authAttempts).every((attempt) => attempt.ok === false), "All ownerB cross-account captures should reject");
  assert(afterAuth.t1_property.country_subdivision === before.t1_property.country_subdivision, "Cross-account jurisdiction attempt changed property");
  assert(afterAuth.t1_lease.term_type === before.t1_lease.term_type, "Cross-account term attempt changed lease");
  assert(afterAuth.t1_lease.tenancy_class === before.t1_lease.tenancy_class, "Cross-account tier4 attempt changed lease");
  assert(afterAuth.owner_b_capture_events_against_owner_a === 0, "OwnerB capture event was written against ownerA account");

  const invalidAttempts = {
    after_qualifying_date: captureTerm({
      termType: "periodic",
      effectiveFrom: "2026-06-01",
      evidenceBasis: "statutory_conversion",
    }),
    missing_evidence_basis: captureTerm({
      termType: "periodic",
      effectiveFrom: "2026-05-01",
      evidenceBasis: null,
    }),
    wrong_term_type: captureTerm({
      termType: "fixed",
      effectiveFrom: "2026-05-01",
      evidenceBasis: "agreement_clause",
    }),
  };

  const afterInvalid = getStoredState();
  const afterInvalidEvaluation = recordEvaluation(IDS.leaseT1);
  assert(Object.values(invalidAttempts).every((attempt) => attempt.ok === false), "All invalid term captures should reject");
  assert(afterInvalid.t1_lease.term_type === null, "Invalid capture half-wrote term_type");
  assert(afterInvalid.t1_lease.term_type_effective_from === null, "Invalid capture half-wrote term_type_effective_from");
  assert(afterInvalid.t1_lease.term_type_evidence_basis === null, "Invalid capture half-wrote term_type_evidence_basis");
  assert(afterInvalid.term_capture_events === 0, "Rejected term captures wrote provenance events");
  assert(includesOnlyMissing(afterInvalidEvaluation, "active_on_qualifying_date"), "T1 should still need active_on_qualifying_date after invalid captures");

  const validTermCapture = captureTerm({
    termType: "periodic",
    effectiveFrom: "2026-05-01",
    evidenceBasis: "statutory_conversion",
  });
  assert(validTermCapture.ok === true, "Valid term capture should succeed");
  const postTermEvaluation = recordEvaluation(IDS.leaseT1);
  const postTermReadiness = getCaptureReadiness(IDS.leaseT1);
  const afterValidTerm = getStoredState();

  assert(afterValidTerm.t1_lease.term_type === "periodic", "Valid term capture did not store term_type");
  assert(afterValidTerm.t1_lease.term_type_effective_from === "2026-05-01", "Valid term capture did not store effective_from");
  assert(afterValidTerm.t1_lease.term_type_evidence_basis === "statutory_conversion", "Valid term capture did not store evidence basis");
  assert(postTermEvaluation.aod_branch === "time_qualified_periodic_indicator", "Post-term evaluation should use periodic indicator branch");
  assert(!postTermEvaluation.missing_fields.includes("active_on_qualifying_date"), "Post-term evaluation still blocks on active_on_qualifying_date");
  assert(postTermEvaluation.id !== afterInvalidEvaluation.id, "Post-term evaluation id should be fresh");
  assert(postTermReadiness.current_evaluation_id === postTermEvaluation.id, "Capture readiness did not read latest post-term evaluation");
  assert(postTermReadiness.next_capture_action !== "capture_term_indicator", "Readiness still surfaces resolved active-on-date blocker");

  const jurisdictionCapture = captureJurisdiction(IDS.propertyT2, "England");
  assert(jurisdictionCapture.ok === true, "Jurisdiction capture should succeed for T2");
  const postJurisdictionEvaluation = recordEvaluation(IDS.leaseT2);
  const postJurisdictionReadiness = getCaptureReadiness(IDS.leaseT2);
  assert(!postJurisdictionEvaluation.missing_fields.includes("jurisdiction"), "T2 still blocks on jurisdiction after capture");
  assert(postJurisdictionReadiness.next_capture_action === "capture_term_indicator", "T2 readiness should advance from jurisdiction to term indicator");

  const tier4Capture = captureTier4();
  assert(tier4Capture.ok === true, "Tier4 capture should succeed");
  const postTier4Evaluation = recordEvaluation(IDS.leaseT1);
  const finalState = getStoredState();

  const captureEvents = finalState.capture_events;
  const eventTypes = new Set(captureEvents.map((event) => event.event_type));
  for (const required of [
    "rpe.capture.jurisdiction_confirmed",
    "rpe.capture.term_indicator_confirmed",
    "rpe.capture.tier4_classification_confirmed",
  ]) {
    assert(eventTypes.has(required), `Missing capture event ${required}`);
  }

  for (const event of captureEvents) {
    const metadata = event.metadata;
    assert(metadata.account_id, `${event.event_type} missing account_id`);
    assert(metadata.captured_by === IDS.ownerA, `${event.event_type} missing captured_by ownerA`);
    assert(metadata.captured_at, `${event.event_type} missing captured_at`);
    assert(metadata.field_name, `${event.event_type} missing field_name`);
    assert(Object.prototype.hasOwnProperty.call(metadata, "old_value"), `${event.event_type} missing old_value`);
    assert(Object.prototype.hasOwnProperty.call(metadata, "new_value"), `${event.event_type} missing new_value`);
    assert(metadata.capture_source === "manual_rpe_capture", `${event.event_type} wrong capture_source`);
    assert(metadata.demo_mode === true, `${event.event_type} demo_mode not true`);
  }

  const termEvent = captureEvents.find((event) => event.event_type === "rpe.capture.term_indicator_confirmed");
  assert(termEvent.metadata.evidence_basis === "statutory_conversion", "Term event missing evidence_basis");

  const evaluationDemoModes = psql(`
    select jsonb_build_object(
      'non_demo_count', count(*) filter (where demo_mode is not true),
      'evaluation_count', count(*)
    )::text
    from public.rule_evaluation
    where tenancy_id in ('${IDS.leaseT1}', '${IDS.leaseT2}');
  `, { json: true });
  assert(Number(evaluationDemoModes.non_demo_count) === 0, "A recorded diagnostic evaluation was not demo_mode=true");

  const summary = {
    setup: {
      accountA: IDS.accountA,
      accountB: IDS.accountB,
      ownerA: IDS.ownerA,
      ownerB: IDS.ownerB,
      t1: {
        property_id: IDS.propertyT1,
        tenancy_id: IDS.leaseT1,
        initial_result: initialT1.result,
        initial_missing_fields: initialT1.missing_fields,
        initial_evaluation_id: initialT1.id,
      },
      t2: {
        property_id: IDS.propertyT2,
        tenancy_id: IDS.leaseT2,
        initial_result: initialT2.result,
        initial_missing_fields: initialT2.missing_fields,
        initial_evaluation_id: initialT2.id,
      },
    },
    checks: {
      "1_authorization": {
        pass: true,
        attempts: Object.fromEntries(Object.entries(authAttempts).map(([key, attempt]) => [
          key,
          { rejected: !attempt.ok, message: attempt.message?.split("\n").find((line) => line.includes("Not authorized")) || attempt.message },
        ])),
        stored_row_unchanged: true,
        owner_b_capture_events_against_owner_a: afterAuth.owner_b_capture_events_against_owner_a,
      },
      "2_admissibility_rejection": {
        pass: true,
        attempts: Object.fromEntries(Object.entries(invalidAttempts).map(([key, attempt]) => [
          key,
          { rejected: !attempt.ok, message: attempt.message?.split("\n").find((line) => line.includes("ERROR:")) || attempt.message },
        ])),
        stored_term_fields_after_rejection: {
          term_type: afterInvalid.t1_lease.term_type,
          term_type_effective_from: afterInvalid.t1_lease.term_type_effective_from,
          term_type_evidence_basis: afterInvalid.t1_lease.term_type_evidence_basis,
        },
        term_capture_events_after_rejection: afterInvalid.term_capture_events,
        post_rejection_result: afterInvalidEvaluation.result,
        post_rejection_missing_fields: afterInvalidEvaluation.missing_fields,
      },
      "3_c_shaped_rescue": {
        pass: true,
        capture_event_id: validTermCapture.data.capture_event_id,
        stored_term_fields: {
          term_type: afterValidTerm.t1_lease.term_type,
          term_type_effective_from: afterValidTerm.t1_lease.term_type_effective_from,
          term_type_evidence_basis: afterValidTerm.t1_lease.term_type_evidence_basis,
        },
        post_capture_result: postTermEvaluation.result,
        post_capture_missing_fields: postTermEvaluation.missing_fields,
        post_capture_aod_branch: postTermEvaluation.aod_branch,
      },
      "4_freshness": {
        pass: true,
        pre_capture_evaluation_id: afterInvalidEvaluation.id,
        post_capture_evaluation_id: postTermEvaluation.id,
        readiness_current_evaluation_id: postTermReadiness.current_evaluation_id,
        readiness_next_capture_action: postTermReadiness.next_capture_action,
        readiness_blocking_fields: postTermReadiness.blocking_fields,
      },
      "5_provenance_attribution": {
        pass: true,
        event_count: captureEvents.length,
        event_types: [...eventTypes].sort(),
        term_event_evidence_basis: termEvent.metadata.evidence_basis,
        non_demo_evaluation_count: evaluationDemoModes.non_demo_count,
        final_t1_result: postTier4Evaluation.result,
        final_t1_reason_codes: postTier4Evaluation.reason_codes,
      },
      "6_order": {
        pass: true,
        t2_initial_missing_fields: initialT2.missing_fields,
        t2_post_jurisdiction_missing_fields: postJurisdictionEvaluation.missing_fields,
        t2_readiness_next_capture_action: postJurisdictionReadiness.next_capture_action,
      },
    },
    closure: {
      pass: true,
      message: "VS-2A closure diagnostic passed all six checks.",
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
