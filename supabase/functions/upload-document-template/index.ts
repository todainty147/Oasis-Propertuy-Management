import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
    });

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const form = await req.formData();
    const templateId = String(form.get("templateId") || "").trim();
    const file = form.get("file");

    if (!templateId) {
      return respond({ error: "templateId is required" }, 400);
    }

    if (!(file instanceof File)) {
      return respond({ error: "file is required" }, 400);
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return respond({ error: "Unsupported template file type" }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return respond({ error: "Template file is too large" }, 400);
    }

    const templateQuery = await admin
      .from("document_templates")
      .select("id, account_id, storage_path, upload_status")
      .eq("id", templateId)
      .single();

    if (templateQuery.error || !templateQuery.data) {
      return safeError(req, templateQuery.error, 404, "Template not found", {
        surface: "document_templates",
        templateId,
      });
    }

    const template = templateQuery.data;
    const permission = await admin.rpc("can_manage_document_templates", {
      p_account_id: template.account_id,
      p_user_id: user.id,
    });

    if (permission.error) {
      return safeError(req, permission.error, 400, "Could not verify template permissions", {
        surface: "can_manage_document_templates",
        templateId,
        accountId: template.account_id,
      });
    }

    if (!permission.data) {
      return respond({ error: "Not permitted" }, 403);
    }

    let storagePath = String(template.storage_path || "").trim();
    if (!/^[0-9a-f-]{36}\/templates\/[0-9a-f-]{36}\/.+$/i.test(storagePath)) {
      const repaired = await admin.rpc("repair_document_template_stub_path", {
        p_template_id: templateId,
        p_filename: file.name,
        p_actor_user_id: user.id,
      });

      if (repaired.error) {
        return safeError(req, repaired.error, 400, "Could not repair template storage path", {
          surface: "repair_document_template_stub_path",
          templateId,
        });
      }

      storagePath = String(repaired.data?.storage_path || "").trim();
      if (!storagePath) {
        return respond({ error: "Template storage path repair returned no path" }, 400);
      }
    }

    const upload = await admin.storage
      .from("documents")
      .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });

    if (upload.error) {
      return safeError(req, upload.error, 400, "Could not upload template file", {
        surface: "documents_storage_upload",
        templateId,
        storagePath,
      });
    }

    return respond({
      templateId,
      storagePath,
      path: upload.data?.path || null,
      fullPath: upload.data?.fullPath || null,
    });
  } catch (error) {
    return safeError(req, error, 500, "Template upload failed");
  }
});

function safeError(
  req: Request,
  error: unknown,
  status: number,
  message: string,
  context: Record<string, unknown> = {},
) {
  return safeErrorResponse(req, {
    allowedOrigins: ALLOWED_APP_ORIGINS,
    error,
    functionName: "upload-document-template",
    message,
    status,
    context,
  });
}
