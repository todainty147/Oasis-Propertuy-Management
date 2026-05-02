import { supabase } from "../lib/supabase";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function requestPasswordResetEmail(email, { inviteToken = "" } = {}) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanInviteToken = String(inviteToken || "").trim();
  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL for password reset email function");
  }
  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY for password reset email function");
  }

  const functionUrl = `${baseUrl}/functions/v1/send-password-reset-email`;
  const { data: sessionData } = await supabase.auth.getSession();
  const authToken = sessionData?.session?.access_token || anonKey;

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      email: cleanEmail,
      ...(cleanInviteToken ? { inviteToken: cleanInviteToken } : {}),
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw friendly(payload, "Failed to send reset link");
  }

  return payload;
}
