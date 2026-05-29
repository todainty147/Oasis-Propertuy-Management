export const DEFAULT_HMRC_READ_ONLY_SCOPES = Object.freeze([
  "hello",
  "read:self-assessment",
]);

// Includes the sandbox-only test-support write scope. Operational HMRC features
// still use read-only defaults unless a dedicated test-data reconnect requests it.
export const APPROVED_HMRC_SANDBOX_SCOPES = Object.freeze([
  ...DEFAULT_HMRC_READ_ONLY_SCOPES,
  "write:self-assessment",
  "read:vat",
]);

export const HMRC_CONNECTION_STATUSES = Object.freeze([
  "not_connected",
  "pending",
  "connected",
  "expired",
  "revoked",
  "failed",
  "disconnected",
]);

export function validateHmrcScopes(requestedScopes: unknown): string[] {
  const input = Array.isArray(requestedScopes) && requestedScopes.length
    ? requestedScopes
    : DEFAULT_HMRC_READ_ONLY_SCOPES;
  const normalized = Array.from(new Set(
    input
      .map((scope) => String(scope || "").trim())
      .filter(Boolean),
  ));
  const invalid = normalized.filter((scope) => !APPROVED_HMRC_SANDBOX_SCOPES.includes(scope));
  if (invalid.length) {
    throw new Error("Unsupported HMRC scope requested");
  }
  return normalized;
}

export function ensureSandboxProbeScope(scopes: string[]): string[] {
  return Array.from(new Set(["hello", ...scopes]));
}

export function generateOauthStateToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function createOauthStateExpiry(now = new Date(), ttlMinutes = 10): string {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
}

export function isOauthStateExpired(expiresAt: string | Date, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function normalizeHmrcConnectionStatus(status: unknown): string {
  const normalized = String(status || "").trim().toLowerCase();
  return HMRC_CONNECTION_STATUSES.includes(normalized) ? normalized : "not_connected";
}

export function assertLiveSubmissionDisabled(environment = "sandbox", liveSubmissionEnabled = "false") {
  if (environment !== "sandbox" || String(liveSubmissionEnabled).toLowerCase() === "true") {
    throw new Error("Live HMRC submission is disabled for this phase");
  }
  return true;
}

export function safeHmrcConnectionPayload(row: Record<string, unknown> | null | undefined) {
  return {
    connection_status: normalizeHmrcConnectionStatus(row?.connection_status),
    environment: String(row?.environment || "sandbox"),
    scopes: Array.isArray(row?.scopes) ? row.scopes : [],
    last_connected_at: row?.last_connected_at || null,
    last_refreshed_at: row?.last_refreshed_at || null,
    hmrc_display_label: row?.hmrc_display_label || null,
  };
}

export async function encryptToken(plaintext: string, keyMaterial: string): Promise<string> {
  if (!plaintext) return "";
  const key = await deriveAesKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `v2.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(ciphertext: string, keyMaterial: string): Promise<string> {
  const parts = String(ciphertext || "").split(".");
  if (parts.length !== 3 || !["v1", "v2"].includes(parts[0])) {
    throw new Error("Unsupported token ciphertext format");
  }
  const key = parts[0] === "v1"
    ? await deriveLegacyAesKey(keyMaterial)
    : await deriveAesKey(keyMaterial);
  const iv = base64UrlDecode(parts[1]);
  const encrypted = base64UrlDecode(parts[2]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(plaintext);
}

async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
  if (!String(keyMaterial || "").trim()) {
    throw new Error("HMRC token encryption key is not configured");
  }
  const sourceKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("tenaqo-hmrc-token-v1"),
      info: new TextEncoder().encode("hmrc-token-enc"),
    },
    sourceKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveLegacyAesKey(keyMaterial: string): Promise<CryptoKey> {
  if (!String(keyMaterial || "").trim()) {
    throw new Error("HMRC token encryption key is not configured");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyMaterial),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function generatePkceCodeVerifier(byteLength = 64): string {
  return generateOauthStateToken(byteLength);
}

export async function createPkceCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
