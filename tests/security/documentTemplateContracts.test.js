import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("document template repository contracts", () => {
  it("keeps the document template overlay in local bootstrap and repo replay order", () => {
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(bootstrapSource).toContain("document_templates.sql");
    expect(applySource).toContain('"document_templates.sql"');
  });

  it("keeps templates account-scoped and hidden from tenant/contractor roles", () => {
    const sql = readSource("supabase/document_templates.sql");

    expect(sql).toContain("create table if not exists public.document_templates");
    expect(sql).toContain("alter table public.document_templates enable row level security");
    expect(sql).toContain("public.account_member_has_permission(account_id, 'documents.read'");
    expect(sql).toContain("public.account_member_effective_role(account_id, auth.uid()) = any (array['owner', 'admin', 'staff'])");
    expect(sql).toContain("public.can_manage_document_templates");
    expect(sql).toContain("split_part(name, '/', 2) = 'templates'");
    expect(sql).toContain("public.can_access_document_template_storage");
  });
});
