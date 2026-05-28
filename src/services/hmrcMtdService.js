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
    sandboxProfile: data?.sandboxProfile || null,
    auditEvents: data?.auditEvents || [],
    readinessChecks: data?.readinessChecks || [],
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

export async function saveHmrcSandboxProfile(accountId, profile) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-save-sandbox-profile", {
    body: { account_id: accountId, ...profile },
  });
  if (error) throw safeInvokeError(error, "Could not save HMRC sandbox test identifier.");
  return data?.sandboxProfile || null;
}

export async function readHmrcBusinessDetails(accountId) {
  return invokeHmrcReadOnlyCheck(accountId, "hmrc-read-business-details", "Could not check HMRC Business Details.");
}

export async function readHmrcObligations(accountId) {
  return invokeHmrcReadOnlyCheck(accountId, "hmrc-read-obligations", "Could not check HMRC Obligations.");
}

export async function readHmrcPropertyBusiness(accountId) {
  return invokeHmrcReadOnlyCheck(accountId, "hmrc-read-property-business", "Could not check HMRC Property Business.");
}

export async function runHmrcReadonlyVerification(accountId) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke("hmrc-run-readonly-verification", {
    body: { account_id: accountId },
  });
  if (error) throw safeInvokeError(error, "Could not run HMRC read-only verification.");
  return data || null;
}

async function invokeHmrcReadOnlyCheck(accountId, functionName, fallback) {
  assertAccount(accountId);
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { account_id: accountId },
  });
  if (error) throw safeInvokeError(error, fallback);
  return data || null;
}

export function normalizeHmrcConnectionStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ["not_connected", "pending", "connected", "expired", "revoked", "failed", "disconnected"].includes(normalized)
    ? normalized
    : "not_connected";
}
