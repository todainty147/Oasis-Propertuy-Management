import { createClient } from "npm:@supabase/supabase-js@2";
import twilio from "npm:twilio";
import {
  getCronAuthResult,
  recordScheduledFunctionEvent,
  serializeError,
} from "../_shared/scheduledObservability.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const APP_URL = Deno.env.get("APP_URL") || "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SmsBody = {
  accountId?: string;
  dryRun?: boolean;
};

type NotificationRow = {
  id: string;
  account_id: string;
  user_id: string | null;
  type: string;
  title: string | null;
  body: string | null;
  link_path: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const RENT_REMINDER_TYPES = ["overdue_rent"];
const MAINTENANCE_ALERT_TYPES = [
  "maintenance_request_created",
  "maintenance_status_changed",
  "maintenance_triage_needed",
  "work_order_created",
  "work_order_assigned",
  "work_order_status_changed",
  "work_order_blocked_follow_up",
  "contractor_ack_overdue",
];
const SMS_NOTIFICATION_TYPES = [...RENT_REMINDER_TYPES, ...MAINTENANCE_ALERT_TYPES];

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!CRON_SECRET) {
      await recordScheduledFunctionEvent(admin, {
        surface: "send-sms-notifications",
        reason: "cron_secret_not_configured",
        code: "cron_secret_not_configured",
        correlationId: requestId,
      });
      return json({ ok: false, error: "CRON_SECRET is not configured" }, 500);
    }

    const auth = getCronAuthResult(req, CRON_SECRET);
    if (!auth.ok) {
      await recordScheduledFunctionEvent(admin, {
        surface: "send-sms-notifications",
        reason: "unauthorized_cron_invocation",
        code: "unauthorized",
        outcome: "denied",
        correlationId: requestId,
        metadata: {
          auth_method: auth.method,
          method: req.method,
        },
      });
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as SmsBody;
    const dryRun = body?.dryRun === true;
    const accountIds = await resolveAccountIds(body?.accountId || null);
    const results = [];

    for (const accountId of accountIds) {
      try {
        results.push(await processAccount(accountId, { dryRun }));
      } catch (error) {
        const serialized = serializeError(error);
        await recordScheduledFunctionEvent(admin, {
          surface: "send-sms-notifications",
          reason: "account_processing_failed",
          code: serialized.name,
          accountId,
          correlationId: requestId,
          metadata: {
            error: serialized.message,
            dry_run: dryRun,
          },
        });
        results.push({
          accountId,
          ok: false,
          error: serialized.message,
        });
      }
    }

    return json({
      ok: true,
      dryRun,
      processedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    const serialized = serializeError(error);
    await recordScheduledFunctionEvent(admin, {
      surface: "send-sms-notifications",
      reason: "unexpected_function_failure",
      code: serialized.name,
      correlationId: requestId,
      metadata: {
        error: serialized.message,
      },
    });
    return json(
      {
        ok: false,
        error: serialized.message || "Unexpected SMS notification error",
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
    .in("type", SMS_NOTIFICATION_TYPES)
    .eq("is_read", false)
    .gte("created_at", isoDaysAgo(14));

  if (error) throw error;

  return Array.from(
    new Set((Array.isArray(data) ? data : []).map((row) => String(row?.account_id || "")).filter(Boolean)),
  );
}

async function processAccount(accountId: string, { dryRun }: { dryRun: boolean }) {
  const { data, error } = await admin
    .from("notifications")
    .select("id, account_id, user_id, type, title, body, link_path, entity_type, entity_id, metadata, created_at")
    .eq("account_id", accountId)
    .in("type", SMS_NOTIFICATION_TYPES)
    .eq("is_read", false)
    .gte("created_at", isoDaysAgo(14))
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const notifications = (Array.isArray(data) ? data : []) as NotificationRow[];
  if (notifications.length === 0) {
    return { accountId, sent: 0, skipped: true, reason: "no_open_notifications" };
  }

  const client = !dryRun && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of notifications) {
    const recipient = await resolveRecipientPhone(row);
    if (!recipient?.phone) {
      await logSmsEvent({
        accountId,
        templateKey: classifyTemplateKey(row.type),
        status: "skipped",
        recipientPhone: "missing_phone",
        recipientUserId: recipient?.userId || row.user_id || null,
        entityType: row.entity_type,
        entityId: row.entity_id,
        body: buildSmsBody(row),
        metadata: {
          reason: "no_recipient_phone",
          notification_id: row.id,
          notification_type: row.type,
        },
      });
      skipped += 1;
      continue;
    }

    const smsBody = buildSmsBody(row);
    if (dryRun) {
      await logSmsEvent({
        accountId,
        templateKey: classifyTemplateKey(row.type),
        status: "queued",
        recipientPhone: recipient.phone,
        recipientUserId: recipient.userId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        body: smsBody,
        metadata: {
          dry_run: true,
          notification_id: row.id,
          notification_type: row.type,
        },
      });
      sent += 1;
      continue;
    }

    if (!client || !TWILIO_FROM_NUMBER) {
      await recordScheduledFunctionEvent(admin, {
        surface: "send-sms-notifications",
        reason: "provider_not_configured",
        code: "twilio_not_configured",
        accountId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: {
          notification_id: row.id,
          notification_type: row.type,
          template_key: classifyTemplateKey(row.type),
        },
      });
      await logSmsEvent({
        accountId,
        templateKey: classifyTemplateKey(row.type),
        status: "skipped",
        recipientPhone: recipient.phone,
        recipientUserId: recipient.userId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        body: smsBody,
        metadata: {
          reason: "twilio_not_configured",
          notification_id: row.id,
          notification_type: row.type,
        },
      });
      skipped += 1;
      continue;
    }

    try {
      const message = await client.messages.create({
        body: smsBody,
        from: TWILIO_FROM_NUMBER,
        to: recipient.phone,
      });

      await logSmsEvent({
        accountId,
        templateKey: classifyTemplateKey(row.type),
        status: "sent",
        recipientPhone: recipient.phone,
        recipientUserId: recipient.userId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        body: smsBody,
        providerMessageId: String(message.sid || ""),
        metadata: {
          notification_id: row.id,
          notification_type: row.type,
        },
      });
      sent += 1;
    } catch (error) {
      const serialized = serializeError(error);
      await recordScheduledFunctionEvent(admin, {
        surface: "send-sms-notifications",
        reason: "provider_send_failed",
        code: serialized.name,
        accountId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: {
          error: serialized.message,
          notification_id: row.id,
          notification_type: row.type,
          template_key: classifyTemplateKey(row.type),
        },
      });
      await logSmsEvent({
        accountId,
        templateKey: classifyTemplateKey(row.type),
        status: "failed",
        recipientPhone: recipient.phone,
        recipientUserId: recipient.userId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        body: smsBody,
        metadata: {
          error: serialized.message,
          notification_id: row.id,
          notification_type: row.type,
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

async function resolveRecipientPhone(row: NotificationRow) {
  if (row.entity_type === "tenant" && row.entity_id) {
    const { data } = await admin
      .from("tenants")
      .select("user_id, phone")
      .eq("id", row.entity_id)
      .maybeSingle();
    const phone = normalizePhone(String(data?.phone || ""));
    if (phone) return { phone, userId: String(data?.user_id || row.user_id || "") || null };
  }

  if (row.entity_type === "work_order" && row.entity_id) {
    const { data } = await admin
      .from("work_orders")
      .select("contractor_id, contractor_user_id, contractor_phone")
      .eq("id", row.entity_id)
      .maybeSingle();
    const inlinePhone = normalizePhone(String(data?.contractor_phone || ""));
    if (inlinePhone) return { phone: inlinePhone, userId: String(data?.contractor_user_id || "") || null };

    if (data?.contractor_id) {
      const contractorRes = await admin
        .from("contractors")
        .select("user_id, phone")
        .eq("id", data.contractor_id)
        .maybeSingle();
      const contractorPhone = normalizePhone(String(contractorRes.data?.phone || ""));
      if (contractorPhone) {
        return {
          phone: contractorPhone,
          userId: String(contractorRes.data?.user_id || data?.contractor_user_id || "") || null,
        };
      }
    }
  }

  if (row.user_id) {
    const userRes = await admin.auth.admin.getUserById(row.user_id);
    const phone = normalizePhone(String(userRes.data.user?.phone || userRes.data.user?.user_metadata?.phone || ""));
    if (phone) return { phone, userId: row.user_id };
  }

  return null;
}

function buildSmsBody(row: NotificationRow) {
  const prefix = RENT_REMINDER_TYPES.includes(row.type) ? "Rent reminder" : "Maintenance alert";
  const title = compact(row.title || "");
  const body = compact(row.body || "");
  const link = row.link_path ? compact(`${APP_URL || ""}${row.link_path}`) : "";
  return compact([prefix, title, body, link].filter(Boolean).join(" - ")).slice(0, 320);
}

function classifyTemplateKey(type: string) {
  return RENT_REMINDER_TYPES.includes(type) ? "rent_reminder_sms" : "maintenance_alert_sms";
}

async function logSmsEvent({
  accountId,
  templateKey,
  status,
  recipientPhone,
  recipientUserId = null,
  entityType = null,
  entityId = null,
  body = null,
  providerMessageId = null,
  metadata = {},
}: {
  accountId: string | null;
  templateKey: string;
  status: string;
  recipientPhone: string;
  recipientUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  body?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await admin.from("outbound_sms_events").insert({
    account_id: accountId,
    template_key: templateKey,
    provider: "twilio",
    status,
    recipient_phone: recipientPhone,
    recipient_user_id: recipientUserId,
    entity_type: entityType,
    entity_id: entityId,
    body,
    provider_message_id: providerMessageId,
    metadata,
  });
}

function normalizePhone(value: string) {
  const trimmed = compact(value);
  if (!trimmed) return "";
  return trimmed.replace(/[^\d+]/g, "");
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
