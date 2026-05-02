import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("document notification SQL contracts", () => {
  it("keeps the uploaded-document trigger patch in the bootstrap/apply flow", () => {
    const bootstrap = readFile("scripts/dbBootstrap.js");
    const applyRepoSql = readFile("scripts/dbApplyRepoSql.js");

    expect(bootstrap).toContain("fn_documents_notify_uploaded_patch.sql");
    expect(applyRepoSql).toContain('"fn_documents_notify_uploaded_patch.sql"');
  });

  it("keeps fn_documents_notify_uploaded scoped to validated recipients", () => {
    const sql = readFile("supabase/fn_documents_notify_uploaded_patch.sql");

    expect(sql).toContain("v_safe_recipients uuid[];");
    expect(sql).toContain("into v_safe_recipients");
    expect(sql).toContain("perform public.create_notifications_system(");
    expect(sql).toContain("v_safe_recipients,");
  });
});
