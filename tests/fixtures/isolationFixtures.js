const fixtures = {
  accounts: {
    root: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "OASIS Root",
      isRoot: true,
    },
    accountA: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Starlight Properties",
      isRoot: false,
    },
    accountB: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Harbor View Estates",
      isRoot: false,
    },
  },
  users: {
    rootOwner: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      email: "root.owner@oasis.test",
      role: "root",
    },
    ownerA: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
      email: "owner.a@oasis.test",
      role: "owner",
      accountId: "11111111-1111-1111-1111-111111111111",
    },
    adminA: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
      email: "admin.a@oasis.test",
      role: "admin",
      accountId: "11111111-1111-1111-1111-111111111111",
    },
    staffA: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
      email: "staff.a@oasis.test",
      role: "staff",
      accountId: "11111111-1111-1111-1111-111111111111",
    },
    tenantA1: {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      email: "tenant.a1@oasis.test",
      role: "tenant",
      accountId: "11111111-1111-1111-1111-111111111111",
      tenantId: "33333333-3333-3333-3333-333333333331",
      propertyId: "44444444-4444-4444-4444-444444444441",
    },
    contractorA1: {
      id: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
      email: "contractor.a1@oasis.test",
      role: "contractor",
      accountId: "11111111-1111-1111-1111-111111111111",
      contractorId: "55555555-5555-5555-5555-555555555551",
    },
    ownerB: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
      email: "owner.b@oasis.test",
      role: "owner",
      accountId: "22222222-2222-2222-2222-222222222222",
    },
    staffB: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6",
      email: "staff.b@oasis.test",
      role: "staff",
      accountId: "22222222-2222-2222-2222-222222222222",
    },
    tenantB1: {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
      email: "tenant.b1@oasis.test",
      role: "tenant",
      accountId: "22222222-2222-2222-2222-222222222222",
      tenantId: "33333333-3333-3333-3333-333333333332",
      propertyId: "44444444-4444-4444-4444-444444444442",
    },
    contractorB1: {
      id: "cccccccc-cccc-cccc-cccc-ccccccccccc2",
      email: "contractor.b1@oasis.test",
      role: "contractor",
      accountId: "22222222-2222-2222-2222-222222222222",
      contractorId: "55555555-5555-5555-5555-555555555552",
    },
  },
  memberships: [
    {
      accountId: "11111111-1111-1111-1111-111111111111",
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
      role: "owner",
    },
    {
      accountId: "11111111-1111-1111-1111-111111111111",
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
      role: "admin",
    },
    {
      accountId: "11111111-1111-1111-1111-111111111111",
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
      role: "staff",
    },
    {
      accountId: "22222222-2222-2222-2222-222222222222",
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
      role: "owner",
    },
    {
      accountId: "22222222-2222-2222-2222-222222222222",
      userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6",
      role: "staff",
    },
  ],
  negativeCases: {
    crossAccountDashboard: {
      actorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
      actorAccountId: "11111111-1111-1111-1111-111111111111",
      targetAccountId: "22222222-2222-2222-2222-222222222222",
      expected: "deny",
    },
    tenantCrossRead: {
      actorUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      actorTenantId: "33333333-3333-3333-3333-333333333331",
      targetTenantId: "33333333-3333-3333-3333-333333333332",
      expected: "deny",
    },
    contractorCrossWorkOrder: {
      actorUserId: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
      actorContractorId: "55555555-5555-5555-5555-555555555551",
      targetAccountId: "22222222-2222-2222-2222-222222222222",
      expected: "deny",
    },
  },
};

export const isolationFixtures = Object.freeze(fixtures);

export function listFixtureUsersByAccount(accountId) {
  return Object.values(isolationFixtures.users).filter((user) => user.accountId === accountId);
}

export function getNegativeCases() {
  return Object.values(isolationFixtures.negativeCases);
}
