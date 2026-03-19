import {
  assertIsolationHarnessReady,
  ensureIsolationHarnessSeed,
} from "./helpers/localSupabaseHarness.js";

async function main() {
  console.log("[integration-seed] preflight");
  await assertIsolationHarnessReady();
  console.log("[integration-seed] preflight ok");
  const usersByKey = await ensureIsolationHarnessSeed();
  console.log("[integration-seed] seed ok");
  console.log(
    JSON.stringify(
      {
        ok: true,
        seededUsers: Object.fromEntries(
          Object.entries(usersByKey).map(([key, user]) => [key, user.id]),
        ),
      },
      null,
      2,
    ),
  );
}

function formatSeedError(error) {
  const raw = error?.message ?? error;
  if (typeof raw === "string" && raw) return raw;

  try {
    const json = JSON.stringify(raw ?? error);
    if (json && json !== "{}") return json;
  } catch {
    // ignore
  }

  return String(raw ?? error);
}

main().catch((error) => {
  const message = formatSeedError(error);
  if (
    message.toLowerCase().includes("could not find the table") ||
    message.toLowerCase().includes("schema cache")
  ) {
    console.error(
      [
        "Local Supabase schema is not initialized for the OASIS integration harness.",
        "At least one required core table is missing from the PostgREST schema cache.",
        "Apply the baseline OASIS schema to your local database before running test:integration:seed.",
      ].join(" "),
    );
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
