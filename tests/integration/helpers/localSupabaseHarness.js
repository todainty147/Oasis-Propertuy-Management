import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../../fixtures/isolationFixtures.js";
import { getIntegrationEnv, isIntegrationHarnessConfigured } from "./env.js";

const propertyIds = {
  accountA: "44444444-4444-4444-4444-444444444441",
  accountB: "44444444-4444-4444-4444-444444444442",
};

const paymentIds = {
  accountA: "66666666-6666-6666-6666-666666666661",
  accountB: "66666666-6666-6666-6666-666666666662",
};

const requestIds = {
  accountA: "77777777-7777-7777-7777-777777777771",
  accountB: "77777777-7777-7777-7777-777777777772",
};

const workOrderIds = {
  accountA: "88888888-8888-8888-8888-888888888881",
  accountB: "88888888-8888-8888-8888-888888888882",
};

function formatUtcDateOffset(days) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatStableDueSoonDate() {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);

  const currentDay = date.getUTCDate();
  const lastDayOfMonth = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
    12,
    0,
    0,
    0,
  )).getUTCDate();
  const daysRemainingInMonth = Math.max(lastDayOfMonth - currentDay, 0);
  const safeOffset = Math.min(3, daysRemainingInMonth);

  date.setUTCDate(date.getUTCDate() + safeOffset);
  return date.toISOString().slice(0, 10);
}

export const isolationSeedDates = {
  accountADueDate: formatStableDueSoonDate(),
  accountBOverdueDate: formatUtcDateOffset(-27),
  partialPaymentPaidAt: formatUtcDateOffset(0),
};

export const isolationSeedIds = {
  propertyIds,
  paymentIds,
  requestIds,
  workOrderIds,
};

const runtimeCache = {
  seeded: false,
  usersByKey: null,
};

const requiredCoreTables = [
  { table: "accounts", probeColumn: "id" },
  { table: "account_members", probeColumn: "account_id" },
  { table: "properties", probeColumn: "id" },
  { table: "tenants", probeColumn: "id" },
  { table: "contractors", probeColumn: "id" },
  { table: "payments", probeColumn: "id" },
  { table: "maintenance_requests", probeColumn: "id" },
  { table: "work_orders", probeColumn: "id" },
];

function createAdminClient() {
  const env = getIntegrationEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getIntegrationAdminClient() {
  return createAdminClient();
}

function createAnonClient() {
  const env = getIntegrationEnv();
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function isConnectionRefusedError(error) {
  const message = String(error?.message || "").toLowerCase();
  const causeCode = error?.cause?.code || "";
  return (
    causeCode === "ECONNREFUSED" ||
    causeCode === "EPERM" ||
    message.includes("econnrefused") ||
    message.includes("fetch failed") ||
    message.includes("eperm")
  );
}

function isMissingRelationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function isMissingColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42703" || message.includes("column") && message.includes("does not exist");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeCoreTables(admin) {
  const missingTables = [];

  for (const { table, probeColumn } of requiredCoreTables) {
    const { error } = await admin.from(table).select(probeColumn).limit(1);
    if (!error) continue;

    if (isMissingRelationError(error)) {
      missingTables.push(table);
      continue;
    }

    if (isMissingColumnError(error)) {
      throw new Error(
        `Local integration harness probe mismatch for ${table}.${probeColumn}. Update the harness probe column to match the local schema.`,
      );
    }

    throw error;
  }

  return missingTables;
}

export async function assertIsolationHarnessReady() {
  if (!isIntegrationHarnessConfigured()) {
    throw new Error(
      "Missing integration env. Copy .env.integration.example to .env.integration.local and set local Supabase values.",
    );
  }

  const admin = createAdminClient();
  let missingTables = [];
  const maxAttempts = 12;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      missingTables = await probeCoreTables(admin);
      break;
    } catch (error) {
      if (isConnectionRefusedError(error)) {
        if (attempt === maxAttempts) {
          throw new Error(
            "Local Supabase is not reachable at TEST_SUPABASE_URL. Start your local Supabase stack, confirm the API URL in .env.integration.local, and if you are running inside a restricted sandbox make sure localhost connections are allowed.",
          );
        }
        await sleep(500 * attempt);
        continue;
      }
      if (isMissingRelationError(error)) {
        missingTables = requiredCoreTables.map(({ table }) => table);
        break;
      }
      throw error;
    }
  }

  if (missingTables.length > 0) {
    throw new Error(
      [
        "Local Supabase schema is not initialized for the OASIS integration harness.",
        `Missing core tables: ${missingTables.join(", ")}.`,
        "Apply the baseline OASIS schema to your local database before running test:integration:seed.",
      ].join(" "),
    );
  }

  return { admin };
}

async function listAllUsers(admin) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw error;

    const batch = data?.users || [];
    users.push(...batch);

    if (batch.length < 200) break;
    page += 1;
  }

  return users;
}

function isInvalidCredentialsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("invalid login credentials");
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already registered") || message.includes("user already registered");
}

function formatUnknownError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;

  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}") return json;
  } catch {
    // ignore
  }

  return "[unknown error]";
}

function wrapStepError(step, error) {
  return new Error(`${step}: ${formatUnknownError(error)}`);
}

async function ensureAuthUser(_admin, fixtureKey, userFixture, password) {
  const anon = createAnonClient();
  const metadata = {
    fixture_key: fixtureKey,
    oasis_role: userFixture.role,
  };

  const signIn = await anon.auth.signInWithPassword({
    email: userFixture.email,
    password,
  }).catch((error) => {
    throw wrapStepError(`fixture auth sign-in request failed for ${fixtureKey}`, error);
  });

  if (!signIn.error && signIn.data?.user) {
    return signIn.data.user;
  }

  if (signIn.error && !isInvalidCredentialsError(signIn.error)) {
    throw wrapStepError(`fixture auth sign-in failed for ${fixtureKey}`, signIn.error);
  }

  const signUp = await anon.auth.signUp({
    email: userFixture.email,
    password,
    options: {
      data: metadata,
    },
  }).catch((error) => {
    throw wrapStepError(`fixture auth sign-up request failed for ${fixtureKey}`, error);
  });

  if (signUp.error && !isAlreadyRegisteredError(signUp.error)) {
    throw wrapStepError(`fixture auth sign-up failed for ${fixtureKey}`, signUp.error);
  }

  if (signUp.data?.user) {
    return signUp.data.user;
  }

  const retrySignIn = await anon.auth.signInWithPassword({
    email: userFixture.email,
    password,
  }).catch((error) => {
    throw wrapStepError(`fixture auth retry sign-in request failed for ${fixtureKey}`, error);
  });

  if (retrySignIn.error) {
    throw new Error(
      `Could not authenticate seeded fixture user ${fixtureKey}. If this local Auth user already exists with a different password, reset local auth data or align TEST_USER_PASSWORD. Cause: ${formatUnknownError(retrySignIn.error)}`,
    );
  }

  return retrySignIn.data.user;
}

async function upsertWithContext(client, table, rows) {
  const { error } = await client.from(table).upsert(rows);
  if (error) throw wrapStepError(`upsert failed for ${table}`, error);
}

async function upsertMembership(admin, membership) {
  let { error } = await admin.from("account_members").upsert(membership, {
    onConflict: "account_id,user_id",
  });

  if (
    error &&
    String(error.message || "").toLowerCase().includes('invalid input value for enum account_role: "admin"')
  ) {
    ({ error } = await admin.from("account_members").upsert(
      { ...membership, role: "staff" },
      { onConflict: "account_id,user_id" },
    ));
  }

  if (error) throw wrapStepError("upsert failed for account_members", error);
}

export async function ensureIsolationHarnessSeed() {
  if (runtimeCache.seeded && runtimeCache.usersByKey) {
    return runtimeCache.usersByKey;
  }

  const env = getIntegrationEnv();
  const { admin } = await assertIsolationHarnessReady();
  const usersByKey = {};

  try {
    for (const [fixtureKey, userFixture] of Object.entries(isolationFixtures.users)) {
      usersByKey[fixtureKey] = await ensureAuthUser(admin, fixtureKey, userFixture, env.userPassword);
    }
  } catch (error) {
    throw wrapStepError("fixture auth bootstrap failed", error);
  }

  try {
    await upsertWithContext(admin, "accounts", [
      {
        id: isolationFixtures.accounts.root.id,
        name: isolationFixtures.accounts.root.name,
        created_by: usersByKey.rootOwner.id,
        is_root: true,
        subscription_status: "active",
        subscription_plan: "pro",
      },
      {
        id: isolationFixtures.accounts.accountA.id,
        name: isolationFixtures.accounts.accountA.name,
        created_by: usersByKey.ownerA.id,
        is_root: false,
        subscription_status: "active",
        subscription_plan: "pro",
      },
      {
        id: isolationFixtures.accounts.accountB.id,
        name: isolationFixtures.accounts.accountB.name,
        created_by: usersByKey.ownerB.id,
        is_root: false,
        subscription_status: "active",
        subscription_plan: "pro",
      },
    ]);
  } catch (error) {
    throw wrapStepError("account seed failed", error);
  }

  const memberships = [
    { account_id: isolationFixtures.accounts.root.id, user_id: usersByKey.rootOwner.id, role: "owner" },
    { account_id: isolationFixtures.accounts.accountA.id, user_id: usersByKey.ownerA.id, role: "owner" },
    { account_id: isolationFixtures.accounts.accountA.id, user_id: usersByKey.adminA.id, role: "admin" },
    { account_id: isolationFixtures.accounts.accountA.id, user_id: usersByKey.staffA.id, role: "staff" },
    { account_id: isolationFixtures.accounts.accountB.id, user_id: usersByKey.ownerB.id, role: "owner" },
    { account_id: isolationFixtures.accounts.accountB.id, user_id: usersByKey.staffB.id, role: "staff" },
  ];

  try {
    for (const membership of memberships) {
      await upsertMembership(admin, membership);
    }
  } catch (error) {
    throw wrapStepError("account membership seed failed", error);
  }

  try {
    await upsertWithContext(admin, "properties", [
      {
        id: propertyIds.accountA,
        owner_id: usersByKey.ownerA.id,
        account_id: isolationFixtures.accounts.accountA.id,
        address: "11 Starlight Avenue",
        city: "London",
        size: "2 bed",
        rent: 1200,
        status: "Wolne",
        tenant_id: null,
      },
      {
        id: propertyIds.accountB,
        owner_id: usersByKey.ownerB.id,
        account_id: isolationFixtures.accounts.accountB.id,
        address: "22 Harbor View Road",
        city: "Bristol",
        size: "1 bed",
        rent: 980,
        status: "Wolne",
        tenant_id: null,
      },
    ]);
  } catch (error) {
    throw wrapStepError("property seed failed", error);
  }

  try {
    await upsertWithContext(admin, "tenants", [
      {
        id: isolationFixtures.users.tenantA1.tenantId,
        owner_id: usersByKey.ownerA.id,
        account_id: isolationFixtures.accounts.accountA.id,
        user_id: usersByKey.tenantA1.id,
        property_id: propertyIds.accountA,
        name: "Tenant A1",
        email: isolationFixtures.users.tenantA1.email,
        phone: "+447700900001",
        status: "active",
      },
      {
        id: isolationFixtures.users.tenantB1.tenantId,
        owner_id: usersByKey.ownerB.id,
        account_id: isolationFixtures.accounts.accountB.id,
        user_id: usersByKey.tenantB1.id,
        property_id: propertyIds.accountB,
        name: "Tenant B1",
        email: isolationFixtures.users.tenantB1.email,
        phone: "+447700900002",
        status: "active",
      },
    ]);
  } catch (error) {
    throw wrapStepError("tenant seed failed", error);
  }

  try {
    await upsertWithContext(admin, "properties", [
      {
        id: propertyIds.accountA,
        owner_id: usersByKey.ownerA.id,
        account_id: isolationFixtures.accounts.accountA.id,
        address: "11 Starlight Avenue",
        city: "London",
        size: "2 bed",
        rent: 1200,
        status: "Wynajęte",
        tenant_id: isolationFixtures.users.tenantA1.tenantId,
      },
      {
        id: propertyIds.accountB,
        owner_id: usersByKey.ownerB.id,
        account_id: isolationFixtures.accounts.accountB.id,
        address: "22 Harbor View Road",
        city: "Bristol",
        size: "1 bed",
        rent: 980,
        status: "Wynajęte",
        tenant_id: isolationFixtures.users.tenantB1.tenantId,
      },
    ]);
  } catch (error) {
    throw wrapStepError("property occupancy sync seed failed", error);
  }

  try {
    await upsertWithContext(admin, "contractors", [
      {
        id: isolationFixtures.users.contractorA1.contractorId,
        account_id: isolationFixtures.accounts.accountA.id,
        user_id: usersByKey.contractorA1.id,
        name: "Contractor A1",
        phone: "+447700900101",
        active: true,
      },
      {
        id: isolationFixtures.users.contractorB1.contractorId,
        account_id: isolationFixtures.accounts.accountB.id,
        user_id: usersByKey.contractorB1.id,
        name: "Contractor B1",
        phone: "+447700900102",
        active: true,
      },
    ]);
  } catch (error) {
    throw wrapStepError("contractor seed failed", error);
  }

  try {
    // Delete any stale non-seeded payments before upserting the canonical seed rows.
    // Tests may leave payments behind when they fail mid-run or when afterEach
    // cleanup is skipped; stale overdue rows corrupt finance_snapshot assertions.
    await admin
      .from("payments")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .not("id", "in", `(${paymentIds.accountA})`);
    await admin
      .from("payments")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountB.id)
      .not("id", "in", `(${paymentIds.accountB})`);

    await upsertWithContext(admin, "payments", [
      {
        id: paymentIds.accountA,
        owner_id: usersByKey.ownerA.id,
        account_id: isolationFixtures.accounts.accountA.id,
        property_id: propertyIds.accountA,
        tenant_id: isolationFixtures.users.tenantA1.tenantId,
        amount: 1200,
        status: "due",
        due_date: isolationSeedDates.accountADueDate,
      },
      {
        id: paymentIds.accountB,
        owner_id: usersByKey.ownerB.id,
        account_id: isolationFixtures.accounts.accountB.id,
        property_id: propertyIds.accountB,
        tenant_id: isolationFixtures.users.tenantB1.tenantId,
        amount: 980,
        status: "overdue",
        due_date: isolationSeedDates.accountBOverdueDate,
      },
    ]);
  } catch (error) {
    throw wrapStepError("payment seed failed", error);
  }

  try {
    await upsertWithContext(admin, "maintenance_requests", [
      {
        id: requestIds.accountA,
        account_id: isolationFixtures.accounts.accountA.id,
        property_id: propertyIds.accountA,
        reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
        title: "Leaking tap",
        description: "Kitchen tap leaking slowly",
        priority: "normal",
        status: "open",
      },
      {
        id: requestIds.accountB,
        account_id: isolationFixtures.accounts.accountB.id,
        property_id: propertyIds.accountB,
        reported_by_tenant_id: isolationFixtures.users.tenantB1.tenantId,
        title: "Broken heater",
        description: "Heating not working",
        priority: "high",
        status: "open",
      },
    ]);
  } catch (error) {
    throw wrapStepError("maintenance request seed failed", error);
  }

  try {
    await upsertWithContext(admin, "work_orders", [
      {
        id: workOrderIds.accountA,
        account_id: isolationFixtures.accounts.accountA.id,
        property_id: propertyIds.accountA,
        maintenance_request_id: requestIds.accountA,
        contractor_user_id: usersByKey.contractorA1.id,
        contractor_name: "Contractor A1",
        contractor_phone: "+447700900101",
        status: "assigned",
        created_by: usersByKey.ownerA.id,
      },
      {
        id: workOrderIds.accountB,
        account_id: isolationFixtures.accounts.accountB.id,
        property_id: propertyIds.accountB,
        maintenance_request_id: requestIds.accountB,
        contractor_user_id: usersByKey.contractorB1.id,
        contractor_name: "Contractor B1",
        contractor_phone: "+447700900102",
        status: "assigned",
        created_by: usersByKey.ownerB.id,
      },
    ]);
  } catch (error) {
    throw wrapStepError("work order seed failed", error);
  }

  runtimeCache.seeded = true;
  runtimeCache.usersByKey = usersByKey;

  return usersByKey;
}

export async function signInAsFixtureUser(fixtureUserKey) {
  await ensureIsolationHarnessSeed();

  const env = getIntegrationEnv();
  const fixture = isolationFixtures.users[fixtureUserKey];
  if (!fixture) throw new Error(`Unknown fixture user: ${fixtureUserKey}`);

  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: fixture.email,
    password: env.userPassword,
  });

  if (error) throw error;

  return {
    client,
    user: data.user,
    session: data.session,
    fixture,
  };
}

export async function signInAsUser(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const fixtureEntry = Object.entries(isolationFixtures.users).find(
    ([, fixture]) => String(fixture.email || "").toLowerCase() === normalizedEmail,
  );

  if (fixtureEntry) {
    const { client } = await signInAsFixtureUser(fixtureEntry[0]);
    return client;
  }

  await ensureIsolationHarnessSeed();

  const env = getIntegrationEnv();
  const client = createAnonClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: env.userPassword,
  });

  if (error) throw error;

  return client;
}
