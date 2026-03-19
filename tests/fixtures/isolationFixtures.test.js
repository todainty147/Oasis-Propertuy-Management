import {
  getNegativeCases,
  isolationFixtures,
  listFixtureUsersByAccount,
} from "./isolationFixtures.js";

describe("isolation fixtures", () => {
  it("keeps account scopes deterministic and distinct", () => {
    expect(isolationFixtures.accounts.accountA.id).not.toBe(isolationFixtures.accounts.accountB.id);

    const accountAUsers = listFixtureUsersByAccount(isolationFixtures.accounts.accountA.id);
    const accountBUsers = listFixtureUsersByAccount(isolationFixtures.accounts.accountB.id);

    expect(accountAUsers.some((user) => user.role === "owner")).toBe(true);
    expect(accountAUsers.some((user) => user.role === "tenant")).toBe(true);
    expect(accountAUsers.some((user) => user.role === "contractor")).toBe(true);

    expect(accountBUsers.some((user) => user.role === "owner")).toBe(true);
    expect(accountBUsers.some((user) => user.role === "tenant")).toBe(true);
    expect(accountBUsers.some((user) => user.role === "contractor")).toBe(true);
  });

  it("includes explicit cross-account negative cases for future isolation tests", () => {
    const negativeCases = getNegativeCases();

    expect(negativeCases).toHaveLength(3);
    expect(negativeCases.every((entry) => entry.expected === "deny")).toBe(true);

    expect(isolationFixtures.negativeCases.crossAccountDashboard.actorAccountId).not.toBe(
      isolationFixtures.negativeCases.crossAccountDashboard.targetAccountId,
    );
    expect(isolationFixtures.negativeCases.tenantCrossRead.actorTenantId).not.toBe(
      isolationFixtures.negativeCases.tenantCrossRead.targetTenantId,
    );
  });
});
