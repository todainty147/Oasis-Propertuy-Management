import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseDocumentRow } from "../../src/services/rpcContracts";

const repoRoot = "/mnt/c/users/home/oasisrentalmanagementapp";

describe("tenant portal backend contracts", () => {
  it("parses tenant document highlight metadata from document rows", () => {
    const row = parseDocumentRow({
      id: "doc-1",
      account_id: "account-1",
      visibility: "tenant",
      scope: "tenant",
      name: "Lease",
      storage_path: "documents/doc-1",
      upload_status: "uploaded",
      tenant_highlight: "action_required",
      tenant_highlight_note: "Review this lease addendum",
      tenant_highlight_rank: 5,
      tenant_highlight_updated_at: "2026-04-22T09:00:00.000Z",
    });

    expect(row.tenant_highlight).toBe("action_required");
    expect(row.tenant_highlight_note).toBe("Review this lease addendum");
    expect(row.tenant_highlight_rank).toBe(5);
    expect(row.tenant_highlight_updated_at).toBe("2026-04-22T09:00:00.000Z");
  });

  it("declares tenant document highlight support in repo sql", () => {
    const sql = readFileSync(path.join(repoRoot, "supabase/document_tenant_highlight.sql"), "utf8");

    expect(sql).toContain("tenant_highlight");
    expect(sql).toContain("set_document_tenant_highlight");
    expect(sql).toContain("action_required");
    expect(sql).toContain("tenant_highlight_rank");
    expect(sql).toContain("tenant_highlight_updated_at");
  });

  it("applies tenant document prioritization overlay during local bootstrap", () => {
    const bootstrapSource = readFileSync(path.join(repoRoot, "scripts/dbBootstrap.js"), "utf8");

    expect(bootstrapSource).toContain("document_tenant_highlight.sql");
  });

  it("declares tenant payment collection settings support in repo sql", () => {
    const sql = readFileSync(path.join(repoRoot, "supabase/account_payment_collection_settings.sql"), "utf8");

    expect(sql).toContain("account_payment_collection_settings");
    expect(sql).toContain("collection_status");
    expect(sql).toContain("external_portal");
    expect(sql).toContain("autopay_status");
  });

  it("applies tenant payment collection settings overlay during local bootstrap", () => {
    const bootstrapSource = readFileSync(path.join(repoRoot, "scripts/dbBootstrap.js"), "utf8");
    const verifySource = readFileSync(path.join(repoRoot, "scripts/dbVerify.js"), "utf8");

    expect(bootstrapSource).toContain("account_payment_collection_settings.sql");
    expect(verifySource).toContain("account_payment_collection_settings");
  });

  it("extends tenant activity feed with maintenance progression events", () => {
    const sql = readFileSync(path.join(repoRoot, "supabase/tenant_activity_feed.sql"), "utf8");

    expect(sql).toContain("request_status_changed");
    expect(sql).toContain("contractor_assigned");
    expect(sql).toContain("work_order_action");
    expect(sql).toContain("work_order_audit_rows");
    expect(sql).toContain("al.new_value");
  });
});
