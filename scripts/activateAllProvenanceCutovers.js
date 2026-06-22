#!/usr/bin/env node
/**
 * Bulk-activate provenance finance cutover for all accounts.
 *
 * The transactional activate_provenance_cutover RPC requires auth.uid().
 * A service-role client has no auth context, so this script fetches each
 * account's owner, generates a short-lived session via the admin API,
 * and calls the RPC with that session's access token.
 *
 * Usage:
 *   node scripts/activateAllProvenanceCutovers.js
 *
 * Env:
 *   SUPABASE_URL              (default: http://127.0.0.1:54321)
 *   SUPABASE_SERVICE_ROLE_KEY  (default: local dev key)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getOwnerToken(accountId) {
  const { data: members } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("role", "owner")
    .limit(1);

  if (!members?.length) return null;

  const ownerId = members[0].user_id;
  const { data: user } = await admin.auth.admin.getUserById(ownerId);
  if (!user?.user?.email) return null;

  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.user.email,
  });
  if (!link?.properties?.action_link) return null;

  const token = new URL(link.properties.action_link).searchParams.get("token");
  const ephemeral = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: session } = await ephemeral.auth.verifyOtp({
    token_hash: token,
    type: "magiclink",
  });

  return session?.session?.access_token || null;
}

async function main() {
  console.log("Fetching accounts...");

  const { data: accounts, error: accErr } = await admin
    .from("accounts")
    .select("id, name");

  if (accErr) {
    console.error("Failed to fetch accounts:", accErr.message);
    process.exit(1);
  }

  console.log(`Found ${accounts.length} account(s).\n`);

  let activated = 0;
  let skipped = 0;
  let failed = 0;

  for (const account of accounts) {
    let token;
    try {
      token = await getOwnerToken(account.id);
    } catch (err) {
      console.error(`  FAIL  ${account.name} (${account.id}): cannot get owner token — ${err.message}`);
      failed++;
      continue;
    }

    if (!token) {
      console.error(`  FAIL  ${account.name} (${account.id}): no owner found or token generation failed`);
      failed++;
      continue;
    }

    const authed = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: result, error: rpcErr } = await authed.rpc(
      "activate_provenance_cutover",
      { p_account_id: account.id },
    );

    if (rpcErr) {
      console.error(`  FAIL  ${account.name} (${account.id}): ${rpcErr.message}`);
      failed++;
      continue;
    }

    if (result?.activated === false && result?.reason === "already_active") {
      console.log(`  SKIP  ${account.name} (${account.id}) — already active`);
      skipped++;
    } else if (result?.activated === true) {
      console.log(`  OK    ${account.name} (${account.id}) — activated`);
      activated++;
    } else {
      console.log(`  OK    ${account.name} (${account.id}) — ${JSON.stringify(result)}`);
      activated++;
    }
  }

  console.log(
    `\nDone. Activated: ${activated}, Skipped: ${skipped}, Failed: ${failed}`,
  );
}

main();
