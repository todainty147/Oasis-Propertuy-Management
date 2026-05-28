export const APPROVED_HMRC_READ_ONLY_SCOPES = Object.freeze([
  "hello",
  "read:self-assessment",
  "read:vat",
]);

export const HMRC_LIVE_SUBMISSION_ENABLED = false;

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
    : APPROVED_HMRC_READ_ONLY_SCOPES;
  const normalized = Array.from(new Set(
    input
      .map((scope) => String(scope || "").trim())
      .filter(Boolean),
  ));
  const invalid = normalized.filter((scope) => !APPROVED_HMRC_READ_ONLY_SCOPES.includes(scope));
  if (invalid.length) {
    throw new Error("Unsupported HMRC scope requested");
  }
  return normalized;
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

export function assertLiveSubmissionDisabled() {
  if (HMRC_LIVE_SUBMISSION_ENABLED) {
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
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(ciphertext: string, keyMaterial: string): Promise<string> {
  const parts = String(ciphertext || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported token ciphertext format");
  }
  const key = await deriveAesKey(keyMaterial);
  const iv = base64UrlDecode(parts[1]);
  const encrypted = base64UrlDecode(parts[2]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(plaintext);
}

async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
  if (!String(keyMaterial || "").trim()) {
    throw new Error("HMRC token encryption key is not configured");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyMaterial),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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
