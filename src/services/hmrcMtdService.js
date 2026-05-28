import { supabase } from "../lib/supabase";

function assertAccount(accountId) {
  if (!accountId) throw new Error("Missing account id");
}

function safeInvokeError(error, fallback) {
  return new Error(error?.message || fallback);
}

export async function getHmrcConnectionStatus(accountId) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-get-connection-status", {
    body: { account_id: accountId },
  });
  if (error) throw safeInvokeError(error, "Could not load HMRC connection status.");
  return {
    connection: data?.connection || null,
    auditEvents: data?.auditEvents || [],
  };
}

export async function startHmrcSandboxOAuth(accountId, requestedScopes = []) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-start-oauth", {
    body: { account_id: accountId, requested_scopes: requestedScopes },
  });
  if (error) throw safeInvokeError(error, "Could not start HMRC sandbox connection.");
  if (!data?.redirectUrl) throw new Error("HMRC sandbox redirect URL was not returned.");
  return data;
}

export async function refreshHmrcConnection(accountId) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-refresh-token", {
    body: { account_id: accountId },
  });
  if (error) throw safeInvokeError(error, "Could not refresh HMRC sandbox connection.");
  return data?.connection || null;
}

export async function disconnectHmrc(accountId) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-disconnect", {
    body: { account_id: accountId },
  });
  if (error) throw safeInvokeError(error, "Could not disconnect HMRC.");
  return data?.connection || null;
}

export async function testHmrcReadonlyCall(accountId) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-test-readonly-call", {
    body: { account_id: accountId },
  });
  if (error) throw safeInvokeError(error, "Could not test HMRC sandbox connection.");
  return data?.result || null;
}

export function normalizeHmrcConnectionStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ["not_connected", "pending", "connected", "expired", "revoked", "failed", "disconnected"].includes(normalized)
    ? normalized
    : "not_connected";
}
