import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("invitation token exposure contracts", () => {
  it("does not select raw invitation tokens for manager list/read surfaces", () => {
    const service = readSource("src/services/invitationService.js");
    const page = readSource("src/pages/InvitationsPage.jsx");

    expect(service).toContain('.select("id, account_id, email, role, invited_by, created_at, accepted_at, revoked_at")');
    expect(service).not.toContain('.select("id, account_id, email, role, token, invited_by');
    expect(page).toContain("const inviteLink = row.token ?");
    expect(page).not.toContain('`/invite?token=${row.token}`');
  });

  it("prevents authenticated table-wide SELECT from exposing account_invitations.token", () => {
    const sql = readSource("supabase/account_invitations_saas.sql");

    expect(sql).toContain("revoke select on table public.account_invitations from authenticated;");
    expect(sql).toContain("grant select (");
    expect(sql).not.toMatch(/grant select \([^)]*\btoken\b[^)]*\) on table public\.account_invitations to authenticated;/s);
  });

  it("keeps raw invitation token material out of invite Edge Function success responses", () => {
    const edgeFunction = readSource("supabase/functions/invite-user/index.ts");
    const successResponse = edgeFunction.match(/return respond\(\{\s*ok: true,[\s\S]*?\}\);/)?.[0] || "";

    expect(edgeFunction).toContain('.select("id, account_id, email, role")');
    expect(edgeFunction).toContain('.select("id")');
    expect(edgeFunction).toContain('.select("token")');
    expect(successResponse).not.toContain("token");
    expect(successResponse).not.toContain("inviteUrl");
  });
});
