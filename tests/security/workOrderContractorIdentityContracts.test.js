import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function normalized(sql) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

function functionBody(sql, functionName) {
  const text = normalized(sql);
  const start = text.indexOf(`create or replace function public.${functionName}(`);
  expect(start, `${functionName} must be defined`).toBeGreaterThanOrEqual(0);
  const bodyStart = text.indexOf("as $$", start);
  const bodyEnd = text.indexOf("$$;", bodyStart);
  expect(bodyStart, `${functionName} must use a dollar-quoted body`).toBeGreaterThanOrEqual(0);
  expect(bodyEnd, `${functionName} body must be terminated`).toBeGreaterThan(bodyStart);
  return text.slice(start, bodyEnd);
}

function grantsExecuteToAuthenticated(sql, signature) {
  return new RegExp(`grant execute on function public\\.${signature}\\s+to authenticated`, "i").test(normalized(sql));
}

function grantsExecuteToAnon(sql, signature) {
  return new RegExp(`grant execute on function public\\.${signature}\\s+to anon`, "i").test(normalized(sql));
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

  it("authorizes work_order_create against the requested account before insert", () => {
    const repoSql = read("supabase/work_order_contractor_identity.sql");
    const migrationSql = read("supabase/migrations/20260616000000_harden_work_order_create_and_attachments.sql");

    for (const sql of [repoSql, migrationSql]) {
      const body = functionBody(sql, "work_order_create");
      const authCheck = body.indexOf("if v_user_id is null then");
      const manageCheck = body.indexOf("if not public.user_can_manage_account(p_account_id) then");
      const insert = body.indexOf("insert into public.work_orders");

      expect(manageCheck, "work_order_create must check p_account_id management access").toBeGreaterThan(authCheck);
      expect(manageCheck, "work_order_create must authorize before insert").toBeLessThan(insert);
      expect(body).toContain("raise exception 'access denied' using errcode = '42501'");
    }
  });

  it("keeps browser-callable work-order SECURITY DEFINER RPCs explicitly granted only to authenticated", () => {
    const sources = [
      read("supabase/work_order_contractor_identity.sql"),
      read("supabase/migrations/20260616000000_harden_work_order_create_and_attachments.sql"),
    ];

    const signatures = [
      "work_order_create\\(uuid, uuid, uuid, uuid, text, text, timestamptz, text\\)",
      "work_order_assign_contractor\\(uuid, uuid\\)",
    ];

    for (const sql of sources) {
      for (const signature of signatures) {
        expect(grantsExecuteToAuthenticated(sql, signature), `${signature} needs explicit authenticated EXECUTE`).toBe(true);
        expect(grantsExecuteToAnon(sql, signature), `${signature} must not be granted to anon`).toBe(false);
      }
    }
  });

  it("keeps hardening compatible with allowlisted browser-callable work-order RPCs", () => {
    const hardening = read("supabase/migrations/20260611003000_supabase_linter_final_hardening.sql");
    const repair = read("supabase/migrations/20260616000000_harden_work_order_create_and_attachments.sql");
    const repairTimestamp = Number("20260616000000");

    expect(hardening).toContain("revoke execute on function %s from public");
    expect(hardening).toContain("revoke execute on function %s from anon");
    expect(repair).toContain("grant execute on function public.work_order_create(uuid, uuid, uuid, uuid, text, text, timestamptz, text) to authenticated");
    expect(repair).toContain("grant execute on function public.work_order_assign_contractor(uuid, uuid) to authenticated");
    expect(repairTimestamp).toBeGreaterThan(20260611003000);
  });

  it("separates work-order attachment view from manage/delete permission", () => {
    const storageSql = read("supabase/storage_work_order_attachments_policies.sql");
    const migrationSql = read("supabase/migrations/20260616000000_harden_work_order_create_and_attachments.sql");
    const normalizedStorage = normalized(storageSql);
    const normalizedMigration = normalized(migrationSql);

    const viewBody = functionBody(storageSql, "can_view_work_order_attachment");
    const manageBody = functionBody(storageSql, "can_manage_work_order_attachment");
    const migratedManageBody = functionBody(migrationSql, "can_manage_work_order_attachment");

    expect(viewBody).toContain("or wo.contractor_user_id = auth.uid()");
    expect(manageBody).toContain("public.user_can_manage_account(wo.account_id)");
    expect(manageBody).not.toContain("or wo.contractor_user_id = auth.uid()");
    expect(migratedManageBody).toContain("public.user_can_manage_account(wo.account_id)");
    expect(migratedManageBody).not.toContain("or wo.contractor_user_id = auth.uid()");
    expect(normalizedStorage).toMatch(/for insert to authenticated with check \([^;]*public\.can_view_work_order_attachment/);
    expect(normalizedStorage).toMatch(/for delete to authenticated using \([^;]*public\.can_manage_work_order_attachment/);
    expect(normalizedMigration).toMatch(/for insert to authenticated with check \([^;]*public\.can_view_work_order_attachment/);
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
