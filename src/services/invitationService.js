import { supabase } from "../lib/supabase";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

const ROLE_ALIASES = {
  landlord: "owner",
  manager: "staff",
};

const INVITE_ROLES_BY_INVITER = {
  owner: ["owner", "admin", "staff", "tenant", "contractor"],
  admin: ["admin", "staff", "tenant", "contractor"],
  staff: ["staff", "tenant", "contractor"],
};

export function getAllowedInviteRoles(inviterRole) {
  const key = String(inviterRole || "").toLowerCase();
  return INVITE_ROLES_BY_INVITER[key] ?? [];
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
  return data ?? [];
}

export async function createAccountInvitation({
  accountId,
  email,
  role,
  inviterRole,
  redirectPath = "/invite",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Missing email");

  const normalizedRole = normalizeInviteRole(role);
  if (!normalizedRole) throw new Error("Missing role");
  const allowed = getAllowedInviteRoles(inviterRole);
  if (!allowed.includes(normalizedRole)) {
    throw new Error("You are not allowed to invite this role");
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

  if (error) throw friendly(error, "Failed to create invitation");

  const redirectUrl = `${window.location.origin}${redirectPath}?token=${token}`;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (otpErr) {
    throw friendly(otpErr, "Invitation created but failed to send email link");
  }

  return data;
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

  if (error) throw friendly(error, "Failed to resend invitation email");
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

  if (delErr) throw friendly(delErr, "Failed to revoke invitation");
}
