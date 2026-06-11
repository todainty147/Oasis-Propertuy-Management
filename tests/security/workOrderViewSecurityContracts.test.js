import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SENSITIVE_WORK_ORDER_VIEWS = [
  "work_orders_with_flags",
  "work_orders_pending_cancellation",
];

const AUTHENTICATED_DIRECT_SELECT_ALLOWED = new Set(SENSITIVE_WORK_ORDER_VIEWS);

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function normalized(sql) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

function hasSecurityInvoker(sql, viewName) {
  const text = normalized(sql);
  const createPattern = new RegExp(
    `create (?:or replace )?view (?:\\"public\\"\\.)?\\"?${viewName}\\"?\\s+with \\([^)]*security_invoker\\s*=\\s*'?true'?`,
    "i",
  );
  const alterPattern = new RegExp(
    `alter view (?:if exists )?(?:public\\.)?\\"?${viewName}\\"? set \\([^)]*security_invoker\\s*=\\s*'?true'?\\)`,
    "i",
  );
  return createPattern.test(text) || alterPattern.test(text);
}

function grantsSelectToAnon(sql, viewName) {
  const text = normalized(sql);
  const grantPattern = new RegExp(
    `grant (?:all|select)(?: on table)? on (?:table )?(?:\\"public\\"\\.)?\\"?${viewName}\\"? to \\"?anon\\"?`,
    "i",
  );
  return grantPattern.test(text);
}

describe("work-order view security contracts", () => {
  it("projects contractor identity columns through every work-order view recreation", () => {
    const sqlFiles = [
      readSource("supabase/work_order_contractor_identity.sql"),
      readSource("supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql"),
      readSource("supabase/migrations/20260611002000_restore_work_order_view_contractor_id.sql"),
    ].map(normalized);

    for (const sql of sqlFiles) {
      expect(sql).toContain("wo.contractor_id");
      expect(sql).toContain("contractor_id, contractor_user_id");
    }
  });

  it("creates work-order browser-facing views with security_invoker in repo SQL", () => {
    const sql = readSource("supabase/work_order_contractor_identity.sql");

    for (const viewName of SENSITIVE_WORK_ORDER_VIEWS) {
      expect(hasSecurityInvoker(sql, viewName), `${viewName} must be security_invoker`).toBe(true);
      expect(grantsSelectToAnon(sql, viewName), `${viewName} must not be anon-selectable`).toBe(false);
    }
  });

  it("does not recreate work-order views insecurely in timestamped migrations", () => {
    const migrationSql = readSource("supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql");
    const hardeningSql = readSource("supabase/migrations/20260611000000_security_harden_work_order_views.sql");
    const repairSql = readSource("supabase/migrations/20260611002000_restore_work_order_view_contractor_id.sql");

    for (const viewName of SENSITIVE_WORK_ORDER_VIEWS) {
      expect(hasSecurityInvoker(migrationSql, viewName), `${viewName} recreate migration must harden immediately`).toBe(true);
      expect(grantsSelectToAnon(migrationSql, viewName), `${viewName} recreate migration must revoke anon`).toBe(false);
      expect(hasSecurityInvoker(hardeningSql, viewName), `${viewName} canonical hardening migration must harden`).toBe(true);
      expect(grantsSelectToAnon(hardeningSql, viewName), `${viewName} canonical hardening migration must not grant anon`).toBe(false);
      expect(hasSecurityInvoker(repairSql, viewName), `${viewName} repair migration must harden immediately`).toBe(true);
      expect(grantsSelectToAnon(repairSql, viewName), `${viewName} repair migration must revoke anon`).toBe(false);
    }
  });

  it("keeps linter hardening as a backup rather than the only hardening location", () => {
    const overlaySql = readSource("supabase/supabase_linter_security_hardening.sql");
    const repoSql = readSource("supabase/work_order_contractor_identity.sql");
    const migrationSql = readSource("supabase/migrations/20260611000000_security_harden_work_order_views.sql");

    for (const viewName of SENSITIVE_WORK_ORDER_VIEWS) {
      expect(hasSecurityInvoker(overlaySql, viewName)).toBe(true);
      expect(hasSecurityInvoker(repoSql, viewName)).toBe(true);
      expect(hasSecurityInvoker(migrationSql, viewName)).toBe(true);
    }
  });

  it("keeps baseline work-order views aligned with hardened grants", () => {
    const baselineSql = readSource("supabase/baseline_schema.sql");

    for (const viewName of SENSITIVE_WORK_ORDER_VIEWS) {
      expect(hasSecurityInvoker(baselineSql, viewName), `${viewName} baseline must be security_invoker`).toBe(true);
      expect(grantsSelectToAnon(baselineSql, viewName), `${viewName} baseline must not grant anon`).toBe(false);
    }
  });

  it("only allows authenticated direct SELECT for approved work-order views", () => {
    const sqlFiles = [
      readSource("supabase/work_order_contractor_identity.sql"),
      readSource("supabase/migrations/20260526000000_work_orders_with_flags_add_assignment_columns.sql"),
      readSource("supabase/migrations/20260611000000_security_harden_work_order_views.sql"),
      readSource("supabase/baseline_schema.sql"),
    ].map(normalized);

    for (const viewName of SENSITIVE_WORK_ORDER_VIEWS) {
      const grantPattern = new RegExp(
        `grant select(?: on table)? on (?:table )?(?:\\"public\\"\\.)?\\"?${viewName}\\"? to \\"?authenticated\\"?`,
        "i",
      );
      const hasAuthenticatedGrant = sqlFiles.some((sql) => grantPattern.test(sql));

      expect(AUTHENTICATED_DIRECT_SELECT_ALLOWED.has(viewName)).toBe(true);
      expect(hasAuthenticatedGrant, `${viewName} should remain available to authenticated app screens`).toBe(true);
    }
  });
});
