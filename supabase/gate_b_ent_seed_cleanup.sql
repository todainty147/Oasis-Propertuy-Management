-- ── Gate-B-ENT: Bounded Seed-Deny Cleanup ────────────────────────────────────
-- Removes 12 plan-accessible feature keys seeded as dark-launch kill-switches
-- (enabled = false, created_by IS NULL). These rows are harmless while callers
-- use account_has_feature (which ignores enabled=false on the plan-rank branch)
-- but become silent denies the moment a feature migrates to account_has_effective_feature.
--
-- Overlay position: after gate_b_ent_explain_path.sql
--
-- EXCLUDED from this cleanup:
--   hmrc_mtd_*  — flag_only; toggle_hmrc_live_pilot uses ON CONFLICT DO UPDATE
--                 on seed rows. Deleting them would break the HMRC pilot toggle.
--   evidence_vault_dispute_pack — already removed by gate_b_ent_deposit_export_fix.sql
--
-- REPLAY BEHAVIOUR: the originating seed files run on every full bootstrap replay.
-- After this cleanup deletes the rows, the seed files REINSERT them on the next
-- bootstrap pass (no ON CONFLICT DO NOTHING guard — rows no longer exist). This
-- cleanup deletes them again. Both passes produce 12 × account_count deletions.
-- Final state across all passes: 0 target rows.
--
-- STANDALONE IDEMPOTENCY: applying this file twice in isolation produces 0
-- deletions on the second run and no error.
--
-- Per-key provenance:
--   compliance_safe_tenant_acknowledgement  | compliance_safe_phase2.sql
--   compliance_safe_expiry_reminders        | compliance_safe_phase2.sql
--   risk_protection_suite                   | compliance_safe_phase2.sql
--   evidence_vault_tenant_sharing           | evidence_vault_phase2.sql
--   deposit_deductions_log                  | property_risk_deposit_controls.sql
--   deposit_settlement_statement            | property_risk_deposit_controls.sql
--   eco_upgrade_planner                     | property_risk_deposit_controls.sql
--   portfolio_health_eco_compliance         | property_risk_deposit_controls.sql
--   maintenance_smart_diagnostics           | maintenance_smart_diagnostics.sql
--   tenant_maintenance_diagnostics          | maintenance_smart_diagnostics.sql
--   maintenance_deposit_evidence_linking    | maintenance_smart_diagnostics.sql
--   maintenance_eco_upgrade_linking         | maintenance_smart_diagnostics.sql

delete from public.account_feature_flags
where  enabled     = false
  and  created_by  is null
  and  feature_key in (
    'compliance_safe_tenant_acknowledgement',
    'compliance_safe_expiry_reminders',
    'risk_protection_suite',
    'evidence_vault_tenant_sharing',
    'deposit_deductions_log',
    'deposit_settlement_statement',
    'eco_upgrade_planner',
    'portfolio_health_eco_compliance',
    'maintenance_smart_diagnostics',
    'tenant_maintenance_diagnostics',
    'maintenance_deposit_evidence_linking',
    'maintenance_eco_upgrade_linking'
  );
