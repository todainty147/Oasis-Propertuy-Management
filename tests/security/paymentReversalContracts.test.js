import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

function readSource(path) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("payment reversal contracts", () => {
  it("exposes a delegated payment reversal permission without giving it to staff by default", () => {
    const permissions = readSource("src/utils/permissions.js");
    const roleService = readSource("src/services/roleManagementService.js");

    expect(permissions).toContain('"finance.reverse_payment"');
    expect(roleService).toContain('"finance.reverse_payment"');
    expect(permissions).toContain('finance: ["read", "create", "update", "delete", "reverse_payment"]');
    expect(permissions).toContain('finance: ["read", "create", "update", "reverse_payment"]');
    expect(permissions).toContain('finance: ["read"], // ✅ STAFF READ-ONLY FINANCE');
  });

  it("requires reversal reason and explicit role or permission in the SQL RPC", () => {
    const sql = readSource("supabase/payment_ledger_reversal_hardening.sql");

    expect(sql).toContain("create or replace function public.reverse_payment(");
    expect(sql).toContain("create or replace function public.void_payment(");
    expect(sql).toContain("p_reason text default null::text");
    expect(sql).toContain("Payment reversal reason is required");
    expect(sql).toContain("Payment is already voided");
    expect(sql).toContain("Only paid payments can be reversed");
    expect(sql).toContain("Paid payments must be reversed, not voided");
    expect(sql).toContain("Only voided unpaid charges can be reopened");
    expect(sql).toContain("lower(coalesce(v_pay.status, '')) not in ('paid', 'partial')");
    expect(sql).toContain("coalesce(v_role, '') not in ('owner', 'admin')");
    expect(sql).toContain("public.account_member_has_permission(v_pay.account_id, 'finance.reverse_payment')");
    expect(sql).toContain("set_config('oasis.payment_reversal_reason'");
    expect(sql).toContain("'reversal_reason'");
    expect(sql.indexOf("raise exception 'Not permitted'")).toBeLessThan(
      sql.indexOf("raise exception 'Payment is already voided'"),
    );
    expect(sql.indexOf("raise exception 'Not permitted'")).toBeLessThan(
      sql.indexOf("raise exception 'Only paid payments can be reversed'"),
    );
    expect(sql).toContain("then 'payment_reversed'");
    expect(sql).toContain("then 'payment_voided'");
    expect(sql).toContain("then 'payment_reopened'");
  });

  it("keeps payment reversal UI mutation outside React state updaters", () => {
    const finance = readSource("src/pages/Finance.jsx");
    const handler = finance.slice(
      finance.indexOf("function handleVoidClick(paymentId)"),
      finance.indexOf("const STATUS_PILLS"),
    );

    expect(handler).toContain("if (pendingVoidId === paymentId)");
    expect(handler).toContain("onVoidPayment(paymentId, voidReason.trim());");
    expect(handler).not.toContain("setPendingVoidId((prev)");
  });

  it("keeps payment ledger correction append-only by inserting reversal entries", () => {
    const sql = readSource("supabase/payment_ledger_reversal_hardening.sql");
    const trigger = sql.slice(
      sql.indexOf("create or replace function public.tg_sync_payments_to_ledger()"),
      sql.indexOf("insert into public.role_permissions"),
    );

    expect(trigger).toContain("'payment_reversals'");
    expect(trigger).toContain("'refund'");
    expect(trigger).toContain("'out'");
    expect(trigger).not.toMatch(/\bdelete\s+from\s+public\.ledger_entries\b/i);
    expect(trigger).not.toMatch(/\bdo\s+update\s+set\b/i);
  });
});
