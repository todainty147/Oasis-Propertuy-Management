import { readFileSync } from "node:fs";

import * as securityFailureLogger from "../../src/services/securityFailureLogger.js";
import { supabase } from "../../src/lib/supabase.js";

function readSql(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("security observability contracts", () => {
  it("keeps structured failure context available for key security-sensitive backend workflows", () => {
    const createNotificationsSql = readSql("supabase/create_notifications.sql");
    const invitationSql = readSql("supabase/account_invitations_saas.sql");
    const observabilitySql = readSql("supabase/security_failure_observability.sql");
    const deniedEventSql = readSql("supabase/security_denied_event_stream.sql");
    const hostedSinkSql = readSql("supabase/security_observability_events.sql");
    const hostedSinkFn = readSql("supabase/functions/ingest-security-observability/index.ts");
    const hostedCleanupFn = readSql("supabase/functions/cleanup-security-observability-events/index.ts");
    const inviteEdgeFn = readSql("supabase/functions/invite-user/index.ts");
    const reminderEdgeFn = readSql("supabase/functions/send-reminder-emails/index.ts");
    const deployCronScript = readSql("scripts/deployCronFunctions.js");
    const loggerSource = readSql("src/services/securityFailureLogger.js");
    const hostedSinkServiceSource = readSql("src/services/securityObservabilityService.js");
    const securityAuditPageSource = readSql("src/pages/SecurityAuditPage.jsx");
    const hostedEventsCardSource = readSql("src/pages/security-audit/HostedEventsCard.jsx");

    expect(createNotificationsSql).toContain("public.security_failure_context(");
    expect(invitationSql).toContain("public.security_failure_context(");
    expect(observabilitySql).toContain("create or replace function public.security_failure_context");
    expect(observabilitySql).toContain("create or replace function public.contractor_update_work_order_status");
    expect(observabilitySql).toContain("create or replace function public.work_order_set_status");
    expect(observabilitySql).toContain("create or replace function public.wo_fin_upsert_quote_draft");
    expect(deniedEventSql).toContain("create table if not exists public.security_denied_events");
    expect(deniedEventSql).toContain("create or replace function public.record_security_denied_event");
    expect(deniedEventSql).toContain("create or replace function public.assert_manage_account_access");
    expect(deniedEventSql).toContain("create or replace function public.assert_tenant_scope_access");
    expect(deniedEventSql).toContain("create or replace function public.security_denied_event_actor_role(");
    expect(deniedEventSql).toContain("where public.user_is_root_operator()");
    expect(deniedEventSql).toContain("select public.account_member_effective_role(p_account_id, auth.uid())");
    expect(hostedSinkSql).toContain("create table if not exists public.security_observability_events");
    expect(hostedSinkSql).toContain("create or replace function public.security_observability_event_feed");
    expect(hostedSinkSql).toContain("create or replace function public.cleanup_security_observability_events");
    expect(hostedSinkFn).toContain("security_observability_events");
    expect(hostedCleanupFn).toContain("cleanup_security_observability_events");
    expect(hostedCleanupFn).toContain("CRON_SECRET");
    expect(deployCronScript).toContain('"cleanup-security-observability-events"');
    expect(inviteEdgeFn).toContain("recordSecurityObservabilityEvent");
    expect(reminderEdgeFn).toContain("CRON_SECRET");
    expect(loggerSource).toContain("supabase.functions.invoke(");
    expect(loggerSource).toContain("correlationId: classification.correlationId");
    expect(hostedSinkServiceSource).toContain('supabase.rpc("security_observability_event_feed"');
    expect(securityAuditPageSource).toContain('listSecurityObservabilityEvents(activeAccountId, hostedEventFilters)');
    expect(hostedEventsCardSource).toContain('t("securityAudit.hostedEvents.title")');
  });

  it("keeps durable denied-event follow-up logging wired into the next highest-value app-observed gaps", () => {
    const maintenanceSource = readSql("src/services/maintenanceDashboardService.js");
    const propertyHealthSource = readSql("src/services/propertyHealthScoreService.js");
    const reportingSource = readSql("src/services/reportingService.js");
    const playbookSource = readSql("src/services/playbookAutomationService.js");
    const contractorServiceSource = readSql("src/services/contractorWorkOrderService.js");
    const contractorPortalSource = readSql("src/pages/ContractorPortal.jsx");
    const contractorJobDetailsSource = readSql("src/pages/ContractorJobDetails.jsx");

    expect(maintenanceSource).toContain('logSecurityRelevantFailure("maintenance_kpi_snapshot"');
    expect(propertyHealthSource).toContain('logSecurityRelevantFailure("property_operational_health_snapshot"');
    expect(reportingSource).toContain('logSecurityRelevantFailure("portfolio_weekly_summary"');
    expect(playbookSource).toContain('logSecurityRelevantFailure("playbook_status_snapshot"');
    expect(playbookSource).toContain("throw permissionError(error);");
    expect(playbookSource).not.toContain(
      'if (isMissingBackendObject(error) || isPermissionDenied(error)) {\n      throw new Error("playbook_status_snapshot RPC is not deployed. Run supabase/playbook_status_snapshot.sql.");',
    );
    expect(contractorServiceSource).toContain('logSecurityRelevantFailure("contractor_work_order_cards"');
    expect(contractorServiceSource).toContain('logSecurityRelevantFailure("contractor_allowed_actions"');
    expect(contractorPortalSource).not.toContain('logSecurityRelevantFailure("contractor_work_order_cards"');
    expect(contractorPortalSource).not.toContain('logSecurityRelevantFailure("contractor_allowed_actions"');
    expect(contractorJobDetailsSource).not.toContain('logSecurityRelevantFailure("contractor_work_order_cards"');
    expect(contractorJobDetailsSource).not.toContain('logSecurityRelevantFailure("contractor_allowed_actions"');
  });

  it("scrubs sensitive invite data from client-side security failure logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null });

    securityFailureLogger.logSecurityRelevantFailure("accept_account_invite", {
      error: {
        message: "Invitation expired",
        code: "22023",
        details: "{\"reason\":\"expired\"}",
        hint: "Request a new invite.",
      },
      context: {
        accountId: "11111111-1111-1111-1111-111111111111",
        token: "secret-token",
        email: "hidden@example.com",
        invitationId: "22222222-2222-2222-2222-222222222222",
      },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload] = spy.mock.calls[0];
    expect(payload.classification.kind).toBe("authorization_denied");
    expect(payload.classification.surface).toBe("accept_account_invite");
    expect(payload.classification.reason).toBe("expired");
    expect(payload.context.accountId).toBe("11111111-1111-1111-1111-111111111111");
    expect(payload.context.invitationId).toBe("22222222-2222-2222-2222-222222222222");
    expect(payload.context.token).toBeUndefined();
    expect(payload.context.email).toBeUndefined();

    expect(rpcSpy).toHaveBeenCalledWith("record_security_denied_event", {
      p_event: "accept_account_invite",
      p_account_id: "11111111-1111-1111-1111-111111111111",
      p_entity_type: "account_invitation",
      p_entity_id: "22222222-2222-2222-2222-222222222222",
      p_reason: "expired",
      p_metadata: expect.objectContaining({
        code: "22023",
        hint: "Request a new invite.",
        source_event: "accept_account_invite",
        accountId: "11111111-1111-1111-1111-111111111111",
        invitationId: "22222222-2222-2222-2222-222222222222",
      }),
    });

    expect(rpcSpy.mock.calls[0][1].p_metadata.token).toBeUndefined();
    expect(rpcSpy.mock.calls[0][1].p_metadata.email).toBeUndefined();

    spy.mockRestore();
    rpcSpy.mockRestore();
  });

  it("scrubs storage and document-specific sensitive fields from structured logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null });

    securityFailureLogger.logSecurityRelevantFailure("document_storage_download", {
      error: {
        message: "Access denied",
        code: "42501",
        details:
          "{\"event\":\"assert_manage_account_access\",\"reason\":\"account_role_required\",\"account_id\":\"11111111-1111-1111-1111-111111111111\",\"entity_type\":\"document\",\"entity_id\":\"33333333-3333-3333-3333-333333333333\"}",
        hint: "Only account members can access this document.",
      },
      context: {
        accountId: "11111111-1111-1111-1111-111111111111",
        documentId: "33333333-3333-3333-3333-333333333333",
        storagePath: "account/111/documents/secret-file.pdf",
        filename: "secret-file.pdf",
        originalFilename: "bank-statement.pdf",
      },
    });

    const [, payload] = spy.mock.calls[0];
    expect(payload.classification.kind).toBe("authorization_denied");
    expect(payload.context.documentId).toBe("33333333-3333-3333-3333-333333333333");
    expect(payload.context.storagePath).toBeUndefined();
    expect(payload.context.filename).toBeUndefined();
    expect(payload.context.originalFilename).toBeUndefined();

    expect(rpcSpy).toHaveBeenCalledWith("record_security_denied_event", {
      p_event: "assert_manage_account_access",
      p_account_id: "11111111-1111-1111-1111-111111111111",
      p_entity_type: "document",
      p_entity_id: "33333333-3333-3333-3333-333333333333",
      p_reason: "account_role_required",
      p_metadata: expect.not.objectContaining({
        storagePath: expect.anything(),
        filename: expect.anything(),
        originalFilename: expect.anything(),
      }),
    });

    spy.mockRestore();
    rpcSpy.mockRestore();
  });

  it("preserves safe provider-side correlation fields for document storage failures", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null });

    securityFailureLogger.logSecurityRelevantFailure("document_storage_download", {
      error: {
        message: "Access denied",
        name: "StorageApiError",
        error: "AccessDenied",
        statusCode: 403,
        response: {
          headers: {
            get(name) {
              const lower = String(name).toLowerCase();
              if (lower === "x-request-id") return "req-123";
              if (lower === "x-sb-trace") return "trace-456";
              return null;
            },
          },
        },
      },
      context: {
        accountId: "11111111-1111-1111-1111-111111111111",
        documentId: "33333333-3333-3333-3333-333333333333",
        storageBucket: "documents",
        storagePath: "account/111/documents/secret-file.pdf",
      },
    });

    const [, payload] = spy.mock.calls[0];
    expect(payload.context.documentId).toBe("33333333-3333-3333-3333-333333333333");
    expect(payload.context.storageBucket).toBe("documents");
    expect(payload.context.providerStatus).toBe(403);
    expect(payload.context.providerRequestId).toBe("req-123");
    expect(payload.context.providerTraceId).toBe("trace-456");
    expect(payload.context.providerName).toBe("StorageApiError");
    expect(payload.context.providerCode).toBe("AccessDenied");
    expect(payload.context.storagePath).toBeUndefined();

    expect(rpcSpy).toHaveBeenCalledWith("record_security_denied_event", {
      p_event: "document_storage_download",
      p_account_id: "11111111-1111-1111-1111-111111111111",
      p_entity_type: "document",
      p_entity_id: "33333333-3333-3333-3333-333333333333",
      p_reason: "access_denied",
      p_metadata: expect.objectContaining({
        accountId: "11111111-1111-1111-1111-111111111111",
        documentId: "33333333-3333-3333-3333-333333333333",
        storageBucket: "documents",
        providerStatus: 403,
        providerRequestId: "req-123",
        providerTraceId: "trace-456",
        providerName: "StorageApiError",
        providerCode: "AccessDenied",
      }),
    });

    expect(rpcSpy.mock.calls[0][1].p_metadata.storagePath).toBeUndefined();

    spy.mockRestore();
    rpcSpy.mockRestore();
  });

  it("classifies guard-function denials distinctly from generic backend failures", () => {
    const classified = securityFailureLogger.classifySecurityRelevantFailure(
      "command_center_items",
      {
        message: "Access denied",
        code: "42501",
        details:
          "{\"event\":\"assert_manage_account_access\",\"reason\":\"account_role_required\",\"account_id\":\"11111111-1111-1111-1111-111111111111\",\"entity_type\":\"account\",\"entity_id\":\"11111111-1111-1111-1111-111111111111\"}",
        hint: "Only owner, admin, staff, or root operators can access this account-scoped manager surface.",
      },
      { accountId: "11111111-1111-1111-1111-111111111111" },
    );

    expect(classified.kind).toBe("authorization_denied");
    expect(classified.guardDenied).toBe(true);
    expect(classified.surface).toBe("assert_manage_account_access");
    expect(classified.reason).toBe("account_role_required");
    expect(classified.accountId).toBe("11111111-1111-1111-1111-111111111111");
    expect(classified.entityType).toBe("account");
    expect(classified.entityId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("builds and forwards scrubbed classified events to the hosted sink contract", async () => {
    const classification = securityFailureLogger.classifySecurityRelevantFailure(
      "wo_fin_submit_quote",
      {
        message: "Not allowed (contractor only)",
        code: "42501",
        details:
          "{\"event\":\"wo_fin_submit_quote\",\"reason\":\"assigned_contractor_required\",\"account_id\":\"11111111-1111-1111-1111-111111111111\",\"entity_type\":\"work_order\",\"entity_id\":\"44444444-4444-4444-4444-444444444444\"}",
        hint: "Only the assigned contractor can submit the quote.",
      },
      {
        accountId: "11111111-1111-1111-1111-111111111111",
        workOrderId: "44444444-4444-4444-4444-444444444444",
      },
    );

    const payload = securityFailureLogger.buildHostedSecurityLogPayload(classification);

    expect(payload).toEqual(
      expect.objectContaining({
        category: "contractor_workflow",
        kind: "authorization_denied",
        surface: "wo_fin_submit_quote",
        reason: "assigned_contractor_required",
        accountId: "11111111-1111-1111-1111-111111111111",
        entityType: "work_order",
        entityId: "44444444-4444-4444-4444-444444444444",
        guardDenied: false,
        source: "app_client",
      }),
    );

    expect(payload.context).toEqual({
      accountId: "11111111-1111-1111-1111-111111111111",
      workOrderId: "44444444-4444-4444-4444-444444444444",
    });
  });
});
