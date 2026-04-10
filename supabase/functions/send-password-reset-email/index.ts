import { createClient } from "npm:@supabase/supabase-js@2";

type PasswordResetPayload = {
  email: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const OASIS_PASSWORD_RESETS_FROM =
  Deno.env.get("OASIS_PASSWORD_RESETS_FROM") ||
  Deno.env.get("OASIS_INVITES_FROM") ||
  "no-reply@auth.oasisrental.app";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeAppUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function logEmailEvent({
  status,
  recipientEmail,
  recipientUserId = null,
  subject = null,
  providerMessageId = null,
  metadata = {},
}: {
  status: "queued" | "sent" | "failed" | "skipped";
  recipientEmail: string;
  recipientUserId?: string | null;
  subject?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await admin.from("outbound_email_events").insert({
    account_id: null,
    template_key: "password_reset",
    provider: "resend",
    status,
    recipient_email: recipientEmail,
    recipient_user_id: recipientUserId,
    entity_type: "auth_user",
    entity_id: recipientUserId,
    subject,
    provider_message_id: providerMessageId,
    metadata,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as PasswordResetPayload;
    const email = normalizeEmail(body?.email);
    if (!email) {
      return json({ error: "Email is required" }, 400);
    }

    if (!RESEND_API_KEY) {
      await logEmailEvent({
        status: "failed",
        recipientEmail: email,
        metadata: { reason: "missing_resend_api_key", functionName: "send-password-reset-email" },
      });
      return json({ error: "Password reset email is not configured" }, 500);
    }

    const appBaseUrl = normalizeAppUrl(APP_URL) || normalizeAppUrl(req.headers.get("origin") || "");
    const redirectTo = appBaseUrl ? `${appBaseUrl}/reset-password?flow=recovery` : "";

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkError) {
      const message = String(linkError.message || "").toLowerCase();
      if (message.includes("user not found") || message.includes("email not found") || message.includes("not found")) {
        await logEmailEvent({
          status: "skipped",
          recipientEmail: email,
          metadata: { reason: "user_not_found", functionName: "send-password-reset-email" },
        });
        return json({ ok: true });
      }

      await logEmailEvent({
        status: "failed",
        recipientEmail: email,
        metadata: {
          reason: "generate_link_failed",
          message: linkError.message,
          functionName: "send-password-reset-email",
        },
      });
      return json({ error: "Failed to create password reset link" }, 500);
    }

    const actionLink = linkData?.properties?.action_link || redirectTo;
    const recipientUserId = linkData?.user?.id || null;
    const subject = "Reset your OASIS password";

    await logEmailEvent({
      status: "queued",
      recipientEmail: email,
      recipientUserId,
      subject,
      metadata: { functionName: "send-password-reset-email" },
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: OASIS_PASSWORD_RESETS_FROM,
        to: [email],
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
            <h2 style="margin:0 0 16px">Reset your OASIS password</h2>
            <p style="margin:0 0 16px">We received a request to reset your password.</p>
            <p style="margin:0 0 24px">
              <a href="${actionLink}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                Reset password
              </a>
            </p>
            <p style="margin:0 0 8px">If you did not request this, you can ignore this email.</p>
            <p style="margin:0;color:#475569;font-size:14px">${actionLink}</p>
          </div>
        `,
      }),
    });

    const resendJson = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      await logEmailEvent({
        status: "failed",
        recipientEmail: email,
        recipientUserId,
        subject,
        metadata: {
          reason: "resend_send_failed",
          response: resendJson,
          functionName: "send-password-reset-email",
        },
      });
      return json({ error: "Failed to send password reset email" }, 500);
    }

    await logEmailEvent({
      status: "sent",
      recipientEmail: email,
      recipientUserId,
      subject,
      providerMessageId: resendJson?.id || null,
      metadata: { functionName: "send-password-reset-email" },
    });

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
