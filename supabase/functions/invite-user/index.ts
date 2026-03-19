import { createClient } from "npm:@supabase/supabase-js@2";

type InvitePayload = {
  accountId: string;
  email: string;
  role: "owner" | "admin" | "staff" | "tenant" | "contractor";
  accountName?: string;
};

type SecurityClassification = {
  category: string;
  kind: "authorization_denied" | "unexpected_security_failure";
  surface: string;
  reason: string | null;
  outcome: "denied" | "error";
  code: string | null;
  hint: string | null;
  accountId: string | null;
  entityType: string | null;
  entityId: string | null;
  correlationId: string;
  guardDenied: boolean;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const OASIS_INVITES_FROM = Deno.env.get("OASIS_INVITES_FROM") || "invites@auth.oasisrental.app";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeText(value: unknown) {
  const next = String(value || "").trim().toLowerCase();
  return next || null;
}

function scrubContext(input: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (["token", "inviteToken", "email", "body", "metadata", "rawPayload", "password", "accessToken"].includes(key)) {
        return false;
      }
      if (value === undefined || value === null || value === "") return false;
      return true;
    }),
  );
}

function classifyInviteFailure({
  surface,
  message,
  accountId = null,
  code = null,
  hint = null,
  entityType = null,
  entityId = null,
}: {
  surface: string;
  message: string;
  accountId?: string | null;
  code?: string | null;
  hint?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): SecurityClassification {
  const normalizedMessage = String(message || "").trim().toLowerCase();
  const authorizationDenied =
    code === "401" ||
    code === "403" ||
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("not allowed") ||
    normalizedMessage.includes("forbidden") ||
    normalizedMessage.includes("invite is not allowed");

  return {
    category: "invite_security",
    kind: authorizationDenied ? "authorization_denied" : "unexpected_security_failure",
    surface,
    reason: normalizeText(message)?.replace(/\s+/g, "_") || null,
    outcome: authorizationDenied ? "denied" : "error",
    code,
    hint: hint ? String(hint) : null,
    accountId,
    entityType,
    entityId,
    correlationId: crypto.randomUUID(),
    guardDenied: false,
  };
}

async function recordSecurityObservabilityEvent(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  classification: SecurityClassification,
  context: Record<string, unknown> = {},
) {
  if (!classification.accountId) return;

  const { data: canRecord, error: canRecordError } = await userClient.rpc(
    "actor_can_record_security_denied_event",
    { p_account_id: classification.accountId },
  );
  if (canRecordError || !canRecord) return;

  const { data: actorRole } = await userClient.rpc("security_denied_event_actor_role", {
    p_account_id: classification.accountId,
  });

  await admin.from("security_observability_events").insert({
    account_id: classification.accountId,
    actor_user_id: userId,
    actor_role: actorRole || "authenticated",
    category: classification.category,
    kind: classification.kind,
    surface: classification.surface,
    reason: classification.reason,
    outcome: classification.outcome,
    code: classification.code,
    guard_denied: classification.guardDenied,
    entity_type: classification.entityType,
    entity_id: classification.entityId,
    correlation_id: classification.correlationId,
    source: "edge_function_invite_user",
    metadata: scrubContext({
      hint: classification.hint,
      role: context.role,
      functionName: "invite-user",
    }),
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as InvitePayload;
    const accountId = body?.accountId;
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const accountName = String(body?.accountName || "").trim();

    if (!accountId || !email || !role) {
      return json({ error: "accountId, email and role are required" }, 400);
    }

    if (!["owner", "admin", "staff", "tenant", "contractor"].includes(role)) {
      return json({ error: "Invalid role" }, 400);
    }

    let token = "";
    let createdAccountId = accountId;
    let createdAccountName = accountName || null;

    if (role === "owner") {
      // Must use user-scoped client so auth.uid() inside RPC resolves to caller.
      const { data, error } = await userClient.rpc("create_landlord_invitation", {
        p_root_account_id: accountId,
        p_email: email,
        p_account_name: accountName || null,
      });
      if (error) {
        const classification = classifyInviteFailure({
          surface: "create_landlord_invitation",
          message: error.message,
          accountId,
          code: "403",
        });
        await recordSecurityObservabilityEvent(userClient, user.id, classification, { role });
        return json({ error: error.message, classification }, 400);
      }

      const invite = Array.isArray(data) ? data[0] : data;
      if (!invite?.token) return json({ error: "Landlord invitation token missing" }, 400);
      token = invite.token;
      createdAccountId = invite.account_id ?? accountId;
      createdAccountName = invite.account_name ?? createdAccountName;
    } else {
      // Must use user-scoped client so auth.uid() inside RPC resolves to caller.
      const { data: eligibility, error: eligibilityError } = await userClient.rpc(
        "check_account_invitation_eligibility",
        {
          p_account_id: accountId,
          p_email: email,
          p_role: role,
        },
      );
      if (eligibilityError) {
        const classification = classifyInviteFailure({
          surface: "check_account_invitation_eligibility",
          message: eligibilityError.message,
          accountId,
          code: "403",
        });
        await recordSecurityObservabilityEvent(userClient, user.id, classification, { role });
        return json({ error: eligibilityError.message, classification }, 400);
      }
      if (!eligibility?.ok) {
        const classification = classifyInviteFailure({
          surface: "check_account_invitation_eligibility",
          message: eligibility?.message || "Invite is not allowed",
          accountId,
          code: "403",
        });
        await recordSecurityObservabilityEvent(userClient, user.id, classification, { role });
        return json({ error: eligibility?.message || "Invite is not allowed", classification }, 400);
      }

      token = crypto.randomUUID();
      // Use user-scoped insert so existing RLS/policies remain the source of truth.
      const { data: inviteRow, error: inviteError } = await userClient
        .from("account_invitations")
        .insert({
          account_id: accountId,
          email,
          role: eligibility.normalized_role || role,
          token,
          invited_by: user.id,
        })
        .select("id, token")
        .single();
      if (inviteError || !inviteRow) {
        const classification = classifyInviteFailure({
          surface: "create_account_invitation",
          message: inviteError?.message || "Failed to create invitation",
          accountId,
          code: inviteError?.code || "400",
          entityType: "account_invitation",
          entityId: null,
        });
        await recordSecurityObservabilityEvent(userClient, user.id, classification, { role });
        return json({ error: inviteError?.message || "Failed to create invitation", classification }, 400);
      }
    }

    const redirectTo = `${APP_URL || req.headers.get("origin") || ""}/invite?token=${token}`;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });

    if (linkError) return json({ error: linkError.message }, 400);
    const actionLink = linkData?.properties?.action_link || redirectTo;

    // Optional branded provider email via Resend.
    if (RESEND_API_KEY) {
      const { Resend } = await import("npm:resend");
      const resend = new Resend(RESEND_API_KEY);
      const { data: account } = await admin
        .from("accounts")
        .select("id,name")
        .eq("id", accountId)
        .maybeSingle();
      const { data: branding } = await admin
        .from("account_branding")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();

      const brandName = branding?.brand_name || account?.name || "OASIS Rental";
      const fromName = branding?.email_from_name || `${brandName} via OASIS`;
      const replyTo = branding?.reply_to_email || branding?.support_email || undefined;
      const subject =
        branding?.invite_subject_template?.replaceAll("{{brand_name}}", brandName) ||
        `${brandName} invited you to OASIS`;

      await resend.emails.send({
        from: `${fromName} <${OASIS_INVITES_FROM}>`,
        to: [email],
        replyTo: replyTo ? [replyTo] : undefined,
        subject,
        html: buildInviteEmail({
          brandName,
          logoUrl: branding?.logo_url || "",
          primaryColor: branding?.primary_color || "#2563eb",
          buttonLabel: branding?.invite_button_label || "Accept invitation",
          footerText: branding?.invite_footer_text || "Sent securely via OASIS Rental",
          inviteUrl: actionLink,
          role,
        }),
      });
    }

    return json({
      ok: true,
      token,
      inviteUrl: actionLink,
      accountId: createdAccountId,
      accountName: createdAccountName,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function buildInviteEmail({
  brandName,
  logoUrl,
  primaryColor,
  buttonLabel,
  footerText,
  inviteUrl,
  role,
}: {
  brandName: string;
  logoUrl?: string;
  primaryColor: string;
  buttonLabel: string;
  footerText: string;
  inviteUrl: string;
  role: string;
}) {
  const safeBrand = escapeHtml(brandName);
  const safeRole = escapeHtml(role);

  return `
  <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
      ${
        logoUrl
          ? `<div style="margin-bottom:20px;"><img src="${escapeHtml(logoUrl)}" alt="${safeBrand}" style="max-height:56px;max-width:180px;" /></div>`
          : ""
      }
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">
        You’ve been invited to join ${safeBrand}
      </h1>
      <p style="margin:0 0 14px;color:#374151;font-size:16px;line-height:1.6;">
        You have been invited to join <strong>${safeBrand}</strong> on OASIS as <strong>${safeRole}</strong>.
      </p>
      <div style="margin:28px 0;">
        <a
          href="${escapeHtml(inviteUrl)}"
          style="display:inline-block;background:${escapeHtml(primaryColor)};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
        >
          ${escapeHtml(buttonLabel)}
        </a>
      </div>
      <p style="margin:0 0 10px;color:#6b7280;font-size:13px;line-height:1.6;">
        If the button does not work, copy this link:
      </p>
      <p style="margin:0 0 24px;word-break:break-all;color:#2563eb;font-size:13px;">
        ${escapeHtml(inviteUrl)}
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
        ${escapeHtml(footerText)}
      </p>
    </div>
  </div>
  `;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
