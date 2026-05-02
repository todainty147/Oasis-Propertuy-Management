import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}));

describe("root telemetry access service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("lists parsed support telemetry grants", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          user_id: "user-1",
          user_email: "support@example.com",
          capability: "ROOT_TELEMETRY",
          notes: "Primary support rota",
          granted_by_user_id: "root-1",
          granted_by_email: "root@example.com",
          created_at: "2026-03-28T12:00:00Z",
          expires_at: null,
          revoked_at: null,
        },
      ],
      error: null,
    });

    const { listRootTelemetrySupportAccess } = await import("../../src/services/rootTelemetryAccessService.js");
    const rows = await listRootTelemetrySupportAccess("account-1");

    expect(rows).toEqual([
      expect.objectContaining({
        userId: "user-1",
        userEmail: "support@example.com",
        capability: "root_telemetry",
        grantedByEmail: "root@example.com",
      }),
    ]);
  });

  it("grants and revokes support telemetry access through dedicated rpc calls", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          user_id: "user-1",
          user_email: "support@example.com",
          capability: "root_telemetry",
          notes: "Night shift",
          granted_by_user_id: "root-1",
          granted_by_email: "root@example.com",
          created_at: "2026-03-28T12:00:00Z",
          expires_at: null,
          revoked_at: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user_id: "user-1",
          user_email: "support@example.com",
          capability: "root_telemetry",
          notes: "Night shift",
          granted_by_user_id: "root-1",
          granted_by_email: "root@example.com",
          created_at: "2026-03-28T12:00:00Z",
          expires_at: null,
          revoked_at: "2026-03-28T13:00:00Z",
        },
        error: null,
      });

    const {
      grantRootTelemetrySupportAccess,
      revokeRootTelemetrySupportAccess,
    } = await import("../../src/services/rootTelemetryAccessService.js");

    const granted = await grantRootTelemetrySupportAccess({
      accountId: "account-1",
      userEmail: "support@example.com",
      notes: "Night shift",
    });
    const revoked = await revokeRootTelemetrySupportAccess({
      accountId: "account-1",
      userId: "user-1",
    });

    expect(rpcMock).toHaveBeenNthCalledWith(1, "root_telemetry_support_access_grant", {
      p_account_id: "account-1",
      p_user_email: "support@example.com",
      p_notes: "Night shift",
      p_expires_at: null,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "root_telemetry_support_access_revoke", {
      p_account_id: "account-1",
      p_user_id: "user-1",
    });

    expect(granted).toEqual(expect.objectContaining({ userEmail: "support@example.com", revokedAt: null }));
    expect(revoked).toEqual(expect.objectContaining({ userId: "user-1", revokedAt: "2026-03-28T13:00:00Z" }));
  });

  it("searches known support operators through the root-only directory rpc", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          user_id: "user-1",
          user_email: "support@example.com",
          source: "support_metadata",
          has_root_telemetry: true,
          current_account_granted: true,
          current_expires_at: "2026-04-01T10:00:00Z",
          last_telemetry_access_at: "2026-03-28T09:30:00Z",
        },
      ],
      error: null,
    });

    const { searchRootTelemetrySupportOperators } = await import("../../src/services/rootTelemetryAccessService.js");
    const rows = await searchRootTelemetrySupportOperators({ accountId: "account-1", query: "supp", limit: 8 });

    expect(rpcMock).toHaveBeenCalledWith("root_telemetry_support_operator_directory", {
      p_account_id: "account-1",
      p_query: "supp",
      p_limit: 8,
    });
    expect(rows).toEqual([
      expect.objectContaining({
        userId: "user-1",
        userEmail: "support@example.com",
        source: "support_metadata",
        hasRootTelemetry: true,
        currentAccountGranted: true,
        currentExpiresAt: "2026-04-01T10:00:00Z",
        lastTelemetryAccessAt: "2026-03-28T09:30:00Z",
      }),
    ]);
  });
});
