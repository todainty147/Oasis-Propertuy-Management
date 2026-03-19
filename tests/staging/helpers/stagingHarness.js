import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../../fixtures/isolationFixtures.js";
import { getStagingEnv, isStagingSmokeConfigured } from "./env.js";

function createAnonClient() {
  const env = getStagingEnv();
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function signInAsStagingFixtureUser(fixtureUserKey) {
  if (!isStagingSmokeConfigured()) {
    throw new Error(
      "Missing staging smoke env. Copy .env.staging.example to .env.staging.local and set STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, and STAGING_USER_PASSWORD.",
    );
  }

  const fixture = isolationFixtures.users[fixtureUserKey];
  if (!fixture) throw new Error(`Unknown fixture user: ${fixtureUserKey}`);

  const env = getStagingEnv();
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: fixture.email,
    password: env.userPassword,
  });

  if (error) {
    throw new Error(`Could not authenticate staging fixture user ${fixtureUserKey}: ${error.message}`);
  }

  return {
    client,
    user: data.user,
    session: data.session,
    fixture,
  };
}
