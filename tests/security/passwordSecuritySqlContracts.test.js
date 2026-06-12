import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("password security SQL contracts", () => {
  it("record_own_strong_password resolves account context for contractors and tenants", () => {
    const sql = read("supabase/auth_password_security_profile.sql");
    const migration = read(
      "supabase/migrations/20260612002000_record_own_strong_password_resolve_portal_accounts.sql",
    );

    for (const source of [sql, migration]) {
      expect(source).toContain("from public.account_members");
      expect(source).toContain("from public.contractors");
      expect(source).toContain("and active = true");
      expect(source).toContain("from public.tenants");
      expect(source).toContain("and archived_at is null");
      expect(source).toContain("account_id                = coalesce(excluded.account_id, public.user_security_profile.account_id)");
    }
  });
});
