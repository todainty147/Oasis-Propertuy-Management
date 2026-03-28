import { supabase } from "../lib/supabase";
import { assertEmail, assertRequiredText, normalizeText } from "../utils/validation";
import {
  parseAcceptAccountInviteResult,
  firstRpcRow,
  parseInvitationEligibilityRow,
  parseInvitationRow,
  parseRpcRows,
} from "./rpcContracts";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function buildStructuredEdgeFunctionError(payload, fallback, context = {}) {
  const error = new Error(payload?.error || fallback);
  const classification = payload?.classification || null;
  if (classification?.code) error.code = classification.code;
  if (classification?.hint) error.hint = classification.hint;
  if (classification) {
    error.details = JSON.stringify({
      event: classification.surface || "invite_user_edge_function",
      reason: classification.reason || null,
      account_id: classification.accountId || context.accountId || null,
      entity_type: classification.entityType || null,
      entity_id: classification.entityId || null,
      correlation_id: classification.correlationId || null,
    });
  }
  return error;
}

async function sendInviteViaEdge({ accountId, email, role, accountName }) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error("You must be signed in");
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL for Edge Function invites");
  const functionUrl = `${baseUrl}/functions/v1/invite-user`;

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({
      accountId,
      email,
      role,
      accountName,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = buildStructuredEdgeFunctionError(
      payload,
      "Failed to send invite via Edge Function",
      { accountId },
    );
    logSecurityRelevantFailure("invite_user_edge_function", {
      error,
      context: { accountId, role },
    });
    throw error;
  }
  return payload;
}

const ROLE_ALIASES = {
  landlord: "owner",
  manager: "staff",
};

const INVITE_ROLES_BY_INVITER = {
  owner: ["admin", "staff", "tenant", "contractor"],
  admin: ["admin", "staff", "tenant", "contractor"],
  staff: ["staff", "tenant", "contractor"],
};

export function getAllowedInviteRoles(inviterRole, isRootAccount = false) {
  const key = String(inviterRole || "").toLowerCase();
  const base = INVITE_ROLES_BY_INVITER[key] ?? [];
  if (isRootAccount && ["owner", "admin", "staff"].includes(key)) return ["owner", ...base];
  return base;
}

export function normalizeInviteRole(role) {
  const key = String(role || "").toLowerCase();
  return ROLE_ALIASES[key] || key;
}

export async function listAccountInvitations(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("account_invitations")
    .select("id, account_id, email, role, token, invited_by, created_at, accepted_at, revoked_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw friendly(error, "Failed to load invitations");
  return parseRpcRows(data || [], parseInvitationRow, "account invitation rows");
}

export async function createAccountInvitation({
  accountId,
  email,
  role,
  inviterRole,
  isRootAccount = false,
  accountName = "",
  redirectPath = "/invite",
} = {}) {
  assertRequiredText(accountId, "Missing accountId");
  const cleanEmail = assertEmail(email, "Valid email required");

  const normalizedRole = normalizeInviteRole(role);
  if (!normalizedRole) throw new Error("Missing role");
  const allowed = getAllowedInviteRoles(inviterRole, isRootAccount);
  if (!allowed.includes(normalizedRole)) {
    throw new Error("You are not allowed to invite this role");
  }

  const useBrandedEdgeInvites = String(import.meta.env.VITE_USE_BRANDED_INVITES || "").toLowerCase() === "true";
  if (useBrandedEdgeInvites) {
    return sendInviteViaEdge({
      accountId,
      email: cleanEmail,
      role: normalizedRole,
      accountName,
    });
  }

  // Root account inviting landlord(owner): create isolated account via RPC.
  if (normalizedRole === "owner") {
    if (!isRootAccount) {
      throw new Error("Only root account can invite landlords");
    }

    const fallbackName = cleanEmail.split("@")[0] || cleanEmail;
    const { data, error } = await supabase.rpc("create_landlord_invitation", {
      p_root_account_id: accountId,
      p_email: cleanEmail,
      p_account_name: normalizeText(accountName) || fallbackName,
    });

    if (error) {
      logSecurityRelevantFailure("create_landlord_invitation", {
        error,
        context: { accountId, role: normalizedRole },
      });
      throw friendly(error, "Failed to create landlord invitation");
    }
    const invite = parseInvitationRow(firstRpcRow(data));
    if (!invite?.token) throw new Error("Landlord invitation token missing");

    const redirectUrl = `${window.location.origin}${redirectPath}?token=${invite.token}`;
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: redirectUrl },
    });
    if (otpErr) {
      logSecurityRelevantFailure("landlord_invitation_email_send", {
        error: otpErr,
        context: { accountId, role: normalizedRole },
      });
      throw friendly(otpErr, "Landlord invitation created but failed to send email link");
    }
    return invite;
  }

  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from("account_invitations")
    .insert({
      account_id: accountId,
      email: cleanEmail,
      role: normalizedRole,
      token,
    })
    .select("id, account_id, email, role, token, created_at")
    .single();

  if (error) {
    logSecurityRelevantFailure("create_account_invitation", {
      error,
      context: { accountId, role: normalizedRole },
    });
    throw friendly(error, "Failed to create invitation");
  }

  const redirectUrl = `${window.location.origin}${redirectPath}?token=${token}`;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (otpErr) {
    logSecurityRelevantFailure("account_invitation_email_send", {
      error: otpErr,
      context: { accountId, role: normalizedRole, invitationId: data?.id },
    });
    throw friendly(otpErr, "Invitation created but failed to send email link");
  }

  return parseInvitationRow(data);
}

export async function checkAccountInvitationEligibility({
  accountId,
  email,
  role,
} = {}) {
  if (!accountId) return { ok: false, code: "missing_account", message: "Missing account id" };
  const cleanEmail = String(email || "").trim().toLowerCase();
  const normalizedRole = normalizeInviteRole(role);
  if (!cleanEmail) return { ok: false, code: "missing_email", message: "Missing email" };
  if (!normalizedRole) return { ok: false, code: "missing_role", message: "Missing role" };

  const { data, error } = await supabase.rpc("check_account_invitation_eligibility", {
    p_account_id: accountId,
    p_email: cleanEmail,
    p_role: normalizedRole,
  });

  if (error) {
    logSecurityRelevantFailure("check_account_invitation_eligibility", {
      error,
      context: { accountId, role: normalizedRole },
    });
    throw friendly(error, "Failed to validate invitation");
  }
  return data
    ? parseInvitationEligibilityRow(data)
    : { ok: false, code: "unknown", message: "Validation returned empty response" };
}

export async function resendInvitationEmail(invitation, redirectPath = "/invite") {
  const token = invitation?.token;
  const email = String(invitation?.email || "").trim().toLowerCase();
  if (!token || !email) throw new Error("Invalid invitation");

  const redirectUrl = `${window.location.origin}${redirectPath}?token=${token}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) {
    logSecurityRelevantFailure("resend_invitation_email", {
      error,
      context: { invitationId: invitation?.id, accountId: invitation?.account_id, role: invitation?.role },
    });
    throw friendly(error, "Failed to resend invitation email");
  }
}

export async function revokeInvitation({ invitationId, accountId } = {}) {
  if (!invitationId) throw new Error("Missing invitationId");

  // Preferred path: soft revoke
  const { error } = await supabase
    .from("account_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("account_id", accountId || undefined);

  if (!error) return;

  // Fallback for legacy schemas without revoked_at
  const { error: delErr } = await supabase
    .from("account_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("account_id", accountId || undefined);

  if (delErr) {
    logSecurityRelevantFailure("revoke_invitation", {
      error: delErr,
      context: { invitationId, accountId },
    });
    throw friendly(delErr, "Failed to revoke invitation");
  }
}

export async function acceptAccountInvite(token) {
  if (!token) throw new Error("Missing invite token");

  const { data, error } = await supabase.rpc("accept_account_invite", {
    invite_token: token,
  });

  if (error) {
    logSecurityRelevantFailure("accept_account_invite", {
      error,
      context: { inviteFlow: "accept" },
    });
    throw friendly(error, "Failed to accept invitation");
  }

  return parseAcceptAccountInviteResult(data);
}
