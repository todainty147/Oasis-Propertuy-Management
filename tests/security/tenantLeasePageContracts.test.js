import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../");

describe("get_my_lease SQL contract", () => {
  const sql = readFileSync(path.join(repoRoot, "supabase/get_my_lease.sql"), "utf8");

  it("defines the get_my_lease function", () => {
    expect(sql).toContain("create or replace function public.get_my_lease");
  });

  it("takes p_account_id as parameter", () => {
    expect(sql).toContain("p_account_id uuid");
  });

  it("scopes result to caller via auth.uid() → tenants.user_id", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("t.user_id = auth.uid()");
  });

  it("joins properties to expose property_address", () => {
    expect(sql).toContain("property_address");
    expect(sql).toContain("left join public.properties");
  });

  it("uses SECURITY DEFINER", () => {
    expect(sql.toLowerCase()).toContain("security definer");
  });

  it("sets search_path to public", () => {
    expect(sql).toContain("set search_path = public");
  });

  it("revokes execute from public before granting to authenticated only", () => {
    expect(sql).toContain("revoke all on function public.get_my_lease");
    expect(sql).toContain("grant execute on function public.get_my_lease");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toContain("to anon");
  });

  it("limits result to 1 row", () => {
    expect(sql).toContain("limit 1");
  });

  it("filters by account_id to prevent cross-account data leak", () => {
    expect(sql).toContain("l.account_id = p_account_id");
  });

  it("orders by renewal_status to surface active leases first", () => {
    expect(sql).toContain("order by");
    expect(sql).toContain("renewal_in_progress");
  });
});

describe("tenant portal routing contract", () => {
  const appSource = readFileSync(path.join(repoRoot, "src/App.jsx"), "utf8");

  it("registers /tenant/home route pointing to TenantHomePage", () => {
    expect(appSource).toContain("TenantHomePage");
    expect(appSource).toContain('path="home"');
  });

  it("registers /tenant/lease route pointing to TenantLeasePage", () => {
    expect(appSource).toContain("TenantLeasePage");
    expect(appSource).toContain('path="lease"');
  });

  it("imports TenantHomePage lazily", () => {
    expect(appSource).toContain("import(\"./pages/TenantHomePage\")");
  });

  it("imports TenantLeasePage lazily", () => {
    expect(appSource).toContain("import(\"./pages/TenantLeasePage\")");
  });

  it("tenant home no longer renders the owner Dashboard directly", () => {
    const tenantHomeSection = appSource.slice(
      appSource.indexOf('path="home"'),
      appSource.indexOf('path="home"') + 200,
    );
    expect(tenantHomeSection).not.toContain("<Dashboard");
  });
});

describe("tenant portal nav contract", () => {
  const navSource = readFileSync(path.join(repoRoot, "src/layout/TenantPortalLayout.jsx"), "utf8");

  it("includes a lease nav item pointing to /tenant/lease", () => {
    expect(navSource).toContain("/tenant/lease");
  });

  it("references the lease i18n key", () => {
    expect(navSource).toContain("tenantPortal.shell.nav.lease");
  });

  it("imports ScrollText icon for lease nav", () => {
    expect(navSource).toContain("ScrollText");
  });
});

describe("i18n lease keys contract", () => {
  const messages = readFileSync(path.join(repoRoot, "src/i18n/messages.js"), "utf8");

  const requiredKeys = [
    "tenantPortal.shell.nav.lease",
    "tenantPortal.lease.pageTitle",
    "tenantPortal.lease.startDate",
    "tenantPortal.lease.endDate",
    "tenantPortal.lease.noticePeriod",
    "tenantPortal.lease.noLease",
    "tenantPortal.lease.status.active",
    "tenantPortal.lease.status.expiringSoon",
    "tenantPortal.home.title",
    "tenantPortal.home.leaseCard.title",
    "tenantPortal.home.paymentCard.title",
  ];

  for (const key of requiredKeys) {
    it(`declares i18n key "${key}"`, () => {
      expect(messages).toContain(`"${key}"`);
    });
  }
});
