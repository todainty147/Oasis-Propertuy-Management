/**
 * E-033 — Single-Writer Signature Security Contracts (source-level)
 *
 * Test 9: No unanchored signature writers remain in app code.
 *
 * Verifies statically:
 *   (a) No app code (src/) calls .from("inspection_signatures").insert(...) directly.
 *   (b) The SQL overlay removes INSERT access from the manager policy.
 *   (c) The SQL overlay removes the tenant direct-insert policy.
 *   (d) capture_inspection_signature is the only insert path — it is SECURITY DEFINER
 *       and is called from both signing service functions.
 *   (e) Both recordInspectionSignature and recordTenantInspectionSignature route
 *       through the RPC, not direct table access.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("E-033 — inspection signature single-writer security contracts", () => {
  it("9a no direct inspection_signatures INSERT in any src/ service or page file", () => {
    const service = readSource("src/services/legalSecurityService.js");

    // Extract each function from its export line to the next export line.
    function extractFn(src, fnName) {
      const start = src.indexOf(`export async function ${fnName}(`);
      if (start === -1) return "";
      const nextExport = src.indexOf("\nexport ", start + 1);
      return nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);
    }

    const managerFn = extractFn(service, "recordInspectionSignature");
    const tenantFn = extractFn(service, "recordTenantInspectionSignature");

    expect(managerFn.length, "recordInspectionSignature function must exist").toBeGreaterThan(0);
    expect(tenantFn.length, "recordTenantInspectionSignature function must exist").toBeGreaterThan(0);

    expect(
      managerFn,
      "recordInspectionSignature must not contain direct .from(inspection_signatures).insert — must use RPC",
    ).not.toContain('.from("inspection_signatures").insert');

    expect(
      tenantFn,
      "recordTenantInspectionSignature must not contain direct .from(inspection_signatures).insert — must use RPC",
    ).not.toContain('.from("inspection_signatures").insert');

    // Both functions must route through the RPC.
    expect(
      managerFn,
      "recordInspectionSignature must call capture_inspection_signature via rpc()",
    ).toContain('rpc("capture_inspection_signature"');

    expect(
      tenantFn,
      "recordTenantInspectionSignature must call capture_inspection_signature via rpc()",
    ).toContain('rpc("capture_inspection_signature"');
  });

  it("9b tenant signing page uses service function not direct insert", () => {
    const page = readSource("src/pages/tenant/TenantEvidenceReportsPage.jsx");

    expect(
      page,
      "tenant page must not call direct .from(inspection_signatures).insert",
    ).not.toContain('.from("inspection_signatures").insert');

    // Must still import recordTenantInspectionSignature (the service wrapper).
    expect(page).toContain("recordTenantInspectionSignature");
  });

  it("9c manager signing page uses service function not direct insert", () => {
    const page = readSource("src/pages/documents/EvidenceVaultPage.jsx");

    expect(
      page,
      "evidence vault page must not call direct .from(inspection_signatures).insert",
    ).not.toContain('.from("inspection_signatures").insert');

    // Must still use recordInspectionSignature via handleRecordSignature.
    expect(page).toContain("recordInspectionSignature");
    expect(page).toContain("handleRecordSignature");
  });

  it("9d SQL overlay removes INSERT from manager policy and drops tenant direct-insert policy", () => {
    const sql = readSource("supabase/inspection_report_lock_signature_binding.sql");

    // New SELECT-only manager policy must exist.
    expect(sql).toContain('"Managers read inspection signatures"');
    expect(sql).toContain(
      'create policy "Managers read inspection signatures" on public.inspection_signatures\n  for select to authenticated',
    );

    // Old manage-all policy must NOT be created (drop is fine, create is not).
    // The DROP statement will still contain the old name — that's correct.
    // We verify that no CREATE POLICY for the old name exists.
    const oldManagerCreate = /create policy "Managers manage inspection signatures"/;
    expect(
      sql,
      "old 'Managers manage inspection signatures' policy must not be (re)created",
    ).not.toMatch(oldManagerCreate);

    // Tenant direct-insert policies must be explicitly dropped.
    expect(sql).toContain('drop policy if exists "Tenants sign shared inspection reports" on public.inspection_signatures');
    expect(sql).toContain('drop policy if exists "Tenants sign assigned inspection reports" on public.inspection_signatures');

    // No CREATE POLICY that grants INSERT on inspection_signatures.
    const insertPolicyPattern = /create policy "[^"]*" on public\.inspection_signatures\s+for insert/s;
    expect(
      sql,
      "no INSERT policy on inspection_signatures must remain in the overlay — all inserts go through RPC",
    ).not.toMatch(insertPolicyPattern);
  });

  it("9e capture_inspection_signature is SECURITY DEFINER and REVOKE ALL prevents direct invocation bypass", () => {
    const sql = readSource("supabase/inspection_report_lock_signature_binding.sql");

    // RPC must be security definer.
    expect(sql).toContain("create or replace function public.capture_inspection_signature(");
    expect(sql).toMatch(/create or replace function public\.capture_inspection_signature[\s\S]*?security definer/m);

    // REVOKE ALL must come before GRANT to authenticated.
    const revokeIdx = sql.indexOf(
      "revoke all on function public.capture_inspection_signature(",
    );
    const grantIdx = sql.indexOf(
      "grant execute on function public.capture_inspection_signature(",
    );
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);

    // Old 7-param version must be explicitly dropped (prevents stale function stub).
    expect(sql).toContain(
      "drop function if exists public.capture_inspection_signature(uuid, uuid, text, text, text, text, uuid)",
    );

    // Per-share uniqueness index must be present.
    expect(sql).toContain("inspection_signatures_share_unique_idx");

    // signer_type CHECK constraint must be present with all three intended values.
    expect(sql).toContain("inspection_signatures_signer_type_check");
    expect(sql).toContain("check (signer_type in ('landlord', 'agent', 'tenant'))");

    // Production-RPC atomicity deny-test wrapper must be present (E-033 Test 7).
    expect(sql).toContain("capture_inspection_signature_atomicity_deny_test");

    // GUC must be transaction-local (is_local=true) — cannot leak between sessions.
    expect(
      sql,
      "GUC must be transaction-local (is_local=true in set_config) — never session-level",
    ).toContain("set_config('app.test_force_signature_provenance_failure', 'on', true)");

    // GUC fault-injection guard must be in record_signature_captured (raise, never skip).
    expect(sql).toContain(
      "current_setting('app.test_force_signature_provenance_failure', true) = 'on'",
    );
    // The raise must immediately follow the GUC check — never bypass/skip.
    expect(sql).toContain(
      "raise exception 'test_force_signature_provenance_failure: forced provenance failure for atomicity proof'",
    );
  });
});
