import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "";
const OASIS_REMINDERS_FROM = Deno.env.get("OASIS_REMINDERS_FROM") || "reminders@auth.oasisrental.app";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReminderBody = {
  accountId?: string;
  dryRun?: boolean;
};

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

const REMINDER_TYPES = [
  "overdue_rent",
  "lease_expiring",
  "compliance_due",
  "preventive_due",
  "contractor_ack_overdue",
  "property_health_alert",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!CRON_SECRET) {
      return json({ ok: false, error: "CRON_SECRET is not configured" }, 500);
    }

    const headerSecret = req.headers.get("x-cron-secret") || "";
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (headerSecret !== CRON_SECRET && bearer !== CRON_SECRET) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as ReminderBody;
    const dryRun = body?.dryRun === true;
    const accountIds = await resolveAccountIds(body?.accountId || null);
    const results = [];

    for (const accountId of accountIds) {
      results.push(await processAccount(accountId, { dryRun }));
    }

    return json({
      ok: true,
      dryRun,
      processedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected reminder email error",
      },
      500,
    );
  }
});

async function resolveAccountIds(accountId: string | null) {
  if (accountId) return [accountId];

  const { data, error } = await admin
    .from("notifications")
    .select("account_id")
    .in("type", REMINDER_TYPES)
    .gte("created_at", isoDaysAgo(14));

  if (error) throw error;

  return Array.from(
    new Set((Array.isArray(data) ? data : []).map((row) => String(row?.account_id || "")).filter(Boolean)),
  );
}

async function processAccount(accountId: string, { dryRun }: { dryRun: boolean }) {
  const [accountResult, brandingResult, notificationsResult, recipientsResult] = await Promise.all([
    admin.from("accounts").select("id, name").eq("id", accountId).maybeSingle(),
    admin.from("account_branding").select("brand_name, email_from_name, reply_to_email, support_email").eq("account_id", accountId).maybeSingle(),
    admin
      .from("notifications")
      .select("id, type, title, body, link_path, entity_type, entity_id, created_at")
      .eq("account_id", accountId)
      .in("type", REMINDER_TYPES)
      .eq("is_read", false)
      .gte("created_at", isoDaysAgo(14))
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", accountId)
      .in("role", ["owner", "admin", "staff"]),
  ]);

  if (accountResult.error) throw accountResult.error;
  if (brandingResult.error) throw brandingResult.error;
  if (notificationsResult.error) throw notificationsResult.error;
  if (recipientsResult.error) throw recipientsResult.error;

  const notifications = (Array.isArray(notificationsResult.data) ? notificationsResult.data : []) as NotificationRow[];
  const recipients = Array.from(
    new Set((Array.isArray(recipientsResult.data) ? recipientsResult.data : []).map((row) => String(row?.user_id || "")).filter(Boolean)),
  );

  if (notifications.length === 0) {
    return { accountId, sent: 0, skipped: true, reason: "no_open_notifications" };
  }

  const account = accountResult.data;
  const branding = brandingResult.data;
  const brandName = branding?.brand_name || account?.name || "OASIS Rental";
  const fromName = branding?.email_from_name || `${brandName} via OASIS`;
  const replyTo = branding?.reply_to_email || branding?.support_email || undefined;
  const subject = `${brandName} reminder summary`;

  let resend: { emails: { send: (payload: Record<string, unknown>) => Promise<Record<string, unknown>> } } | null = null;
  if (!dryRun && RESEND_API_KEY) {
    const { Resend } = await import("npm:resend");
    resend = new Resend(RESEND_API_KEY);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const userId of recipients) {
    const userRes = await admin.auth.admin.getUserById(userId);
    const email = String(userRes.data.user?.email || "").trim().toLowerCase();
    if (!email) continue;

    if (dryRun) {
      await logEmailEvent({
        accountId,
        templateKey: "operational_reminder_summary",
        status: "queued",
        recipientEmail: email,
        recipientUserId: userId,
        subject,
        metadata: {
          dry_run: true,
          notification_count: notifications.length,
        },
      });
      sent += 1;
      continue;
    }

    if (!resend) {
      await logEmailEvent({
        accountId,
        templateKey: "operational_reminder_summary",
        status: "skipped",
        recipientEmail: email,
        recipientUserId: userId,
        subject,
        metadata: {
          reason: "resend_not_configured",
          notification_count: notifications.length,
        },
      });
      skipped += 1;
      continue;
    }

    try {
      const response = await resend.emails.send({
        from: `${fromName} <${OASIS_REMINDERS_FROM}>`,
        to: [email],
        replyTo: replyTo ? [replyTo] : undefined,
        subject,
        html: buildReminderEmail({
          brandName,
          appUrl: APP_URL,
          notifications,
        }),
      });

      await logEmailEvent({
        accountId,
        templateKey: "operational_reminder_summary",
        status: "sent",
        recipientEmail: email,
        recipientUserId: userId,
        subject,
        providerMessageId: String(response?.data?.id || ""),
        metadata: {
          notification_count: notifications.length,
          notification_types: notifications.map((row) => row.type),
        },
      });
      sent += 1;
    } catch (error) {
      await logEmailEvent({
        accountId,
        templateKey: "operational_reminder_summary",
        status: "failed",
        recipientEmail: email,
        recipientUserId: userId,
        subject,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown reminder email error",
          notification_count: notifications.length,
        },
      });
      failed += 1;
    }
  }

  return {
    accountId,
    sent,
    failed,
    skipped,
    notificationCount: notifications.length,
  };
}

async function logEmailEvent({
  accountId,
  templateKey,
  status,
  recipientEmail,
  recipientUserId = null,
  entityType = null,
  entityId = null,
  subject = null,
  providerMessageId = null,
  metadata = {},
}: {
  accountId: string | null;
  templateKey: string;
  status: string;
  recipientEmail: string;
  recipientUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await admin.from("outbound_email_events").insert({
    account_id: accountId,
    template_key: templateKey,
    provider: "resend",
    status,
    recipient_email: recipientEmail,
    recipient_user_id: recipientUserId,
    entity_type: entityType,
    entity_id: entityId,
    subject,
    provider_message_id: providerMessageId,
    metadata,
  });
}

function buildReminderEmail({
  brandName,
  appUrl,
  notifications,
}: {
  brandName: string;
  appUrl: string;
  notifications: NotificationRow[];
}) {
  const items = notifications
    .map((row) => {
      const href = row.link_path ? `${appUrl || ""}${row.link_path}` : appUrl || "#";
      return `
        <li style="margin:0 0 12px;">
          <a href="${escapeHtml(href)}" style="color:#2563eb;text-decoration:none;font-weight:600;">
            ${escapeHtml(row.title || "Reminder")}
          </a>
          <div style="margin-top:4px;color:#475569;font-size:14px;">
            ${escapeHtml(row.body || row.type || "")}
          </div>
        </li>
      `;
    })
    .join("");

  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
        <h1 style="margin:0 0 12px;font-size:24px;color:#0f172a;">${escapeHtml(brandName)} reminder summary</h1>
        <p style="margin:0 0 20px;color:#475569;line-height:1.6;">
          Here is a summary of active reminders that still need attention in OASIS.
        </p>
        <ul style="padding-left:18px;margin:0;color:#0f172a;">
          ${items}
        </ul>
      </div>
    </div>
  `;
}

function isoDaysAgo(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString();
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
