import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("work order contractor identity contracts", () => {
  it("adds nullable contractor_id with account-scoped indexes and idempotent user-id backfill", () => {
    const sql = read("supabase/work_order_contractor_identity.sql");

    expect(sql).toContain("add column if not exists contractor_id uuid");
    expect(sql).toContain("constraint work_orders_contractor_id_fkey");
    expect(sql).toContain("references public.contractors(id)");
    expect(sql).toContain("on delete set null");
    expect(sql).toContain("work_orders_account_contractor_idx");
    expect(sql).toContain("on public.work_orders(account_id, contractor_id)");
    expect(sql).toContain("work_orders_contractor_id_idx");
    expect(sql).toContain("where wo.contractor_id is null");
    expect(sql).toContain("c.account_id = wo.account_id");
    expect(sql).toContain("c.user_id = wo.contractor_user_id");
  });

  it("projects contractor_id through work order manager read models and parsing", () => {
    const sql = read("supabase/work_order_contractor_identity.sql");
    const service = read("src/services/workOrderService.js");
    const contracts = read("src/services/rpcContracts.js");

    expect(sql).toContain("wo.contractor_id");
    expect(sql).toContain("create view public.work_orders_with_flags");
    expect(sql).toContain("create view public.work_orders_pending_cancellation");
    expect(service).toContain("contractor_id,");
    expect(service).toContain('.select("account_id, contractor_id, contractor_user_id")');
    expect(service).toContain('.select("id, account_id, property_id, contractor_id, contractor_user_id, status, scheduled_at, updated_at")');
    expect(contracts).toContain("contractor_id: toNullableString(value.contractor_id)");
  });

  it("assigns invited contractors with contractor_id and user_id, and manual contractors with contractor_id only", () => {
    const identitySql = read("supabase/work_order_contractor_identity.sql");
    const assignmentSql = read("supabase/work_order_assignment_authorization.sql");

    [identitySql, assignmentSql].forEach((sql) => {
      expect(sql).toContain("select c.user_id, c.name, c.phone");
      expect(sql).toContain("where c.id = p_contractor_id");
      expect(sql).toContain("and c.account_id = v_account_id");
      expect(sql).toContain("if not found then");
      expect(sql).not.toContain("if v_contractor_user_id is null then");
      expect(sql).toContain("contractor_id      = p_contractor_id");
      expect(sql).toContain("contractor_user_id = v_contractor_user_id");
    });
  });

  it("creates work orders with contractor_id while keeping contractor_user_id as optional portal identity", () => {
    const sql = read("supabase/work_order_contractor_identity.sql");

    expect(sql).toContain("create or replace function public.work_order_create");
    expect(sql).toContain("p_contractor_id uuid default null");
    expect(sql).toContain("where c.id = p_contractor_id");
    expect(sql).toContain("and c.account_id = p_account_id");
    expect(sql).toContain("if not found then");
    expect(sql).toContain("contractor_id,");
    expect(sql).toContain("contractor_user_id,");
    expect(sql).toContain("p_contractor_id,");
    expect(sql).toContain("v_contractor_user_id,");
  });

  it("syncs approved quote assignment to the submitting contractor directory row", () => {
    const identitySql = read("supabase/work_order_contractor_identity.sql");
    const observabilitySql = read("supabase/security_failure_observability.sql");

    expect(identitySql).not.toContain("create or replace function public.wo_fin_approve_quote");
    expect(observabilitySql).toContain("create or replace function public.wo_fin_approve_quote");
    expect(observabilitySql).toContain("from public.contractors c");
    expect(observabilitySql).toContain("c.account_id = wo.account_id");
    expect(observabilitySql).toContain("c.user_id = v_row.quote_submitted_by");
    expect(observabilitySql).toContain("set contractor_id = c.id");
    expect(observabilitySql).toContain("contractor_user_id = c.user_id");
  });

  it("keeps contractor portal access keyed to contractor_user_id, not contractor_id", () => {
    const portalCardsSql = read("supabase/contractor_work_order_cards.sql");
    const observabilitySql = read("supabase/security_failure_observability.sql");
    const storageSql = read("supabase/storage_work_order_attachments_policies.sql");

    expect(portalCardsSql).toContain("where wo.contractor_user_id = auth.uid()");
    expect(observabilitySql).toContain("if v_wo.contractor_user_id is distinct from auth.uid() then");
    expect(observabilitySql).toContain("public.is_assigned_contractor(p_work_order_id, v_uid)");
    expect(storageSql).toContain("or wo.contractor_user_id = auth.uid()");
    expect(portalCardsSql).not.toContain("wo.contractor_id = auth.uid()");
    expect(observabilitySql).not.toContain("contractor_id = auth.uid()");
  });

  it("orders SQL overlays so identity exists before assignment and preferred supplier scoring", () => {
    const source = read("scripts/dbApplyRepoSql.js");
    const identityIndex = source.indexOf('"work_order_contractor_identity.sql"');
    const assignmentIndex = source.indexOf('"work_order_assignment_authorization.sql"');
    const preferredIndex = source.indexOf('"contractor_preferred_supplier_intelligence.sql"');

    expect(identityIndex).toBeGreaterThan(-1);
    expect(assignmentIndex).toBeGreaterThan(identityIndex);
    expect(preferredIndex).toBeGreaterThan(assignmentIndex);
  });

  it("orders local bootstrap so identity exists before assignment authorization", () => {
    const source = read("scripts/dbBootstrap.js");
    const identityIndex = source.indexOf('"work_order_contractor_identity.sql"');
    const assignmentIndex = source.indexOf('"work_order_assignment_authorization.sql"');

    expect(identityIndex).toBeGreaterThan(-1);
    expect(assignmentIndex).toBeGreaterThan(identityIndex);
  });
});
