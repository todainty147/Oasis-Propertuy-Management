import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../tests/fixtures/isolationFixtures.js";

const ENV_FILES = [
  ".env.staging.local",
  ".env.staging.test.local",
  ".env.local",
  ".env",
];

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

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator === -1) return null;

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnv() {
  for (const relativePath of ENV_FILES) {
    const absolutePath = resolve(process.cwd(), relativePath);
    if (!existsSync(absolutePath)) continue;

    const contents = readFileSync(absolutePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      const [key, value] = entry;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function getRequiredEnv(name) {
  const value = process.env[name] || "";
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.staging.local before running the staging fixture seed.`);
  }
  return value;
}

function createAdminClient() {
  return createClient(
    getRequiredEnv("STAGING_SUPABASE_URL"),
    getRequiredEnv("STAGING_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
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

function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function ensureAuthUser(admin, fixtureKey, userFixture, password) {
  const allUsers = await listAllUsers(admin);
  const existing = allUsers.find((user) => user.email?.toLowerCase() === userFixture.email.toLowerCase());
  const userData = {
    email: userFixture.email,
    password,
    email_confirm: true,
    user_metadata: {
      fixture_key: fixtureKey,
      oasis_role: userFixture.role,
    },
  };

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser(userData);
    if (error) throw new Error(`create auth user ${fixtureKey}: ${formatError(error)}`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.updateUserById(existing.id, userData);
  if (error) throw new Error(`update auth user ${fixtureKey}: ${formatError(error)}`);
  return data.user;
}

async function upsertRows(admin, table, rows, options = {}) {
  const { error } = await admin.from(table).upsert(rows, options);
  if (error) throw new Error(`upsert ${table}: ${formatError(error)}`);
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

  if (error) {
    throw new Error(`upsert account_members: ${formatError(error)}`);
  }
}

async function ensureWorkOrders(admin, usersByKey) {
  const { data: existingRows, error: selectError } = await admin
    .from("work_orders")
    .select("id")
    .in("id", [workOrderIds.accountA, workOrderIds.accountB]);

  if (selectError) {
    throw new Error(`select work_orders: ${formatError(selectError)}`);
  }

  const existingIds = new Set((existingRows || []).map((row) => row.id));
  const missingRows = [
    !existingIds.has(workOrderIds.accountA) && {
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
    !existingIds.has(workOrderIds.accountB) && {
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
  ].filter(Boolean);

  if (missingRows.length === 0) return;

  const { error: insertError } = await admin.from("work_orders").insert(missingRows);
  if (insertError) {
    throw new Error(`insert work_orders: ${formatError(insertError)}`);
  }
}

async function main() {
  loadEnv();

  const password = getRequiredEnv("STAGING_USER_PASSWORD");
  const admin = createAdminClient();
  const usersByKey = {};

  console.log("[staging-seed] ensuring auth users");
  for (const [fixtureKey, userFixture] of Object.entries(isolationFixtures.users)) {
    usersByKey[fixtureKey] = await ensureAuthUser(admin, fixtureKey, userFixture, password);
  }

  console.log("[staging-seed] upserting accounts");
  await upsertRows(admin, "accounts", [
    {
      id: isolationFixtures.accounts.accountA.id,
      name: isolationFixtures.accounts.accountA.name,
      created_by: usersByKey.ownerA.id,
      is_root: false,
    },
    {
      id: isolationFixtures.accounts.accountB.id,
      name: isolationFixtures.accounts.accountB.name,
      created_by: usersByKey.ownerB.id,
      is_root: false,
    },
  ]);

  console.log("[staging-seed] upserting memberships");
  const memberships = [
    { account_id: isolationFixtures.accounts.accountA.id, user_id: usersByKey.ownerA.id, role: "owner" },
    { account_id: isolationFixtures.accounts.accountA.id, user_id: usersByKey.adminA.id, role: "admin" },
    { account_id: isolationFixtures.accounts.accountA.id, user_id: usersByKey.staffA.id, role: "staff" },
    { account_id: isolationFixtures.accounts.accountB.id, user_id: usersByKey.ownerB.id, role: "owner" },
    { account_id: isolationFixtures.accounts.accountB.id, user_id: usersByKey.staffB.id, role: "staff" },
  ];

  for (const membership of memberships) {
    await upsertMembership(admin, membership);
  }

  console.log("[staging-seed] upserting properties");
  await upsertRows(admin, "properties", [
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

  console.log("[staging-seed] upserting tenants");
  await upsertRows(admin, "tenants", [
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

  console.log("[staging-seed] syncing occupied properties");
  await upsertRows(admin, "properties", [
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

  console.log("[staging-seed] upserting contractors");
  await upsertRows(admin, "contractors", [
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

  console.log("[staging-seed] upserting payments");
  await upsertRows(admin, "payments", [
    {
      id: paymentIds.accountA,
      owner_id: usersByKey.ownerA.id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: propertyIds.accountA,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      amount: 1200,
      status: "due",
      due_date: "2026-03-25",
    },
    {
      id: paymentIds.accountB,
      owner_id: usersByKey.ownerB.id,
      account_id: isolationFixtures.accounts.accountB.id,
      property_id: propertyIds.accountB,
      tenant_id: isolationFixtures.users.tenantB1.tenantId,
      amount: 980,
      status: "overdue",
      due_date: "2026-03-01",
    },
  ]);

  console.log("[staging-seed] upserting maintenance requests");
  await upsertRows(admin, "maintenance_requests", [
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

  console.log("[staging-seed] ensuring work orders");
  await ensureWorkOrders(admin, usersByKey);

  console.log("[staging-seed] done");
  console.log(
    JSON.stringify(
      {
        ok: true,
        authUsers: Object.fromEntries(
          Object.entries(usersByKey).map(([key, user]) => [key, { id: user.id, email: user.email }]),
        ),
        fixtureIds: {
          propertyIds,
          paymentIds,
          requestIds,
          workOrderIds,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
