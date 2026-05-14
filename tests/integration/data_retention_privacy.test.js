import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/data_retention_privacy.sql"), "utf8");

describe("data retention SQL foundation", () => {
  it("creates privacy request, processing log, export request, and user device tables", () => {
    expect(sql).toContain("create table if not exists public.data_deletion_requests");
    expect(sql).toContain("create table if not exists public.data_deletion_processing_log");
    expect(sql).toContain("create table if not exists public.data_export_requests");
    expect(sql).toContain("create table if not exists public.user_devices");
  });

  it("defines privileged processing and anonymisation helpers", () => {
    expect(sql).toContain("create or replace function public.process_data_deletion_request");
    expect(sql).toContain("create or replace function public.anonymise_user_profile");
    expect(sql).toContain("create or replace function public.anonymise_tenant_profile");
    expect(sql).toContain("create or replace function public.anonymise_contractor_profile");
    expect(sql).toContain("create or replace function public.revoke_user_devices");
    expect(sql).toContain("create or replace function public.remove_user_memberships");
    expect(sql).toContain("create or replace function public.create_retention_summary");
  });

  it("retains finance, audit, and compliance records with logged reasons", () => {
    expect(sql).toContain("'finance_ledger'");
    expect(sql).toContain("'audit_security_logs'");
    expect(sql).toContain("'compliance_records'");
    expect(sql).toContain("'retain_with_reason'");
  });

  it("protects request access with RLS and denies normal processing access", () => {
    expect(sql).toContain("alter table public.data_deletion_requests enable row level security");
    expect(sql).toContain("alter table public.data_deletion_processing_log enable row level security");
    expect(sql).toContain("or auth.role() = 'service_role'");
    expect(sql).toContain("or (v_request.account_id is not null and public.user_can_admin_account(v_request.account_id))");
    expect(sql).toContain("request_type = 'workspace_closure' and account_id is not null and public.user_can_admin_account(account_id)");
  });
});
