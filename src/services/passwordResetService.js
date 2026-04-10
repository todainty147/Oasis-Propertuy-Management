import { supabase } from "../lib/supabase";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function requestPasswordResetEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_URL;
  if (!baseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL for password reset email function");
  }

  const functionUrl = `${baseUrl}/functions/v1/send-password-reset-email`;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || null;

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw friendly(payload, "Failed to send reset link");
  }

  return payload;
}
