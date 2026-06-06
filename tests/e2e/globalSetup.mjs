const DEFAULT_TIMEOUT_MS = 30_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function globalSetup(config) {
  const baseURL = config.projects?.[0]?.use?.baseURL || process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) return;

  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < DEFAULT_TIMEOUT_MS) {
    try {
      const response = await fetch(baseURL, { method: "GET" });
      if (response.ok || response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(750);
  }

  throw new Error(
    [
      "E2E_INFRA_DEV_SERVER_UNAVAILABLE",
      `Playwright app server did not become healthy at ${baseURL}.`,
      lastError?.message ? `Last error: ${lastError.message}` : null,
    ].filter(Boolean).join(" "),
  );
}
