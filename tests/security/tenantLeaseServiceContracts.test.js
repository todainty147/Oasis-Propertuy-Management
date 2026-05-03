import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

function makeMyLeaseRow(overrides = {}) {
  return {
    id: "lease-1",
    account_id: "account-1",
    property_id: "prop-1",
    tenant_id: "tenant-1",
    lease_start_date: "2025-01-01",
    lease_end_date: "2026-01-01",
    renewal_status: "active",
    notice_period_days: 30,
    auto_renew: false,
    notes: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    property_address: "12 Oak Street",
    ...overrides,
  };
}

describe("fetchMyLease service contract", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("requires accountId", async () => {
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    await expect(fetchMyLease(null)).rejects.toThrow();
    await expect(fetchMyLease(undefined)).rejects.toThrow();
  });

  it("calls get_my_lease RPC with p_account_id", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    await fetchMyLease("account-1");
    expect(rpcMock).toHaveBeenCalledWith("get_my_lease", { p_account_id: "account-1" });
  });

  it("returns null when RPC returns empty array", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result).toBeNull();
  });

  it("returns null when RPC returns null", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result).toBeNull();
  });

  it("throws on RPC error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Permission denied" } });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    await expect(fetchMyLease("account-1")).rejects.toThrow();
  });

  it("parses the first returned lease row", async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeMyLeaseRow()], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result).not.toBeNull();
    expect(result.id).toBe("lease-1");
    expect(result.lease_start_date).toBe("2025-01-01");
    expect(result.lease_end_date).toBe("2026-01-01");
  });

  it("attaches propertyLabel from property_address", async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeMyLeaseRow({ property_address: "22 River Lane" })], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result.propertyLabel).toBe("22 River Lane");
  });

  it("falls back to dash when property_address is empty", async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeMyLeaseRow({ property_address: "" })], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result.propertyLabel).toBe("—");
  });

  it("attaches derivedStatus from renewal_status and dates", async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeMyLeaseRow({ renewal_status: "active", lease_end_date: "2030-01-01" })], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result.derivedStatus).toBe("active");
  });

  it("derives ended status when lease_end_date is in the past", async () => {
    const pastDate = "2020-01-01";
    rpcMock.mockResolvedValueOnce({ data: [makeMyLeaseRow({ lease_end_date: pastDate, renewal_status: "active" })], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result.derivedStatus).toBe("ended");
  });

  it("attaches numeric daysUntilEnd", async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeMyLeaseRow({ lease_end_date: "2030-06-01" })], error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(Number.isFinite(result.daysUntilEnd)).toBe(true);
  });

  it("handles single-object data response (not array)", async () => {
    rpcMock.mockResolvedValueOnce({ data: makeMyLeaseRow(), error: null });
    const { fetchMyLease } = await import("../../src/services/leaseService.js");
    const result = await fetchMyLease("account-1");
    expect(result).not.toBeNull();
    expect(result.id).toBe("lease-1");
  });
});

describe("parseMyLeaseRow contract", () => {
  it("parses all expected fields from a raw RPC row", async () => {
    const { parseMyLeaseRow } = await import("../../src/services/rpcContracts.js");
    const row = makeMyLeaseRow();
    const parsed = parseMyLeaseRow(row);
    expect(parsed.id).toBe("lease-1");
    expect(parsed.account_id).toBe("account-1");
    expect(parsed.property_id).toBe("prop-1");
    expect(parsed.tenant_id).toBe("tenant-1");
    expect(parsed.lease_start_date).toBe("2025-01-01");
    expect(parsed.lease_end_date).toBe("2026-01-01");
    expect(parsed.renewal_status).toBe("active");
    expect(parsed.notice_period_days).toBe(30);
    expect(parsed.auto_renew).toBe(false);
    expect(parsed.property_address).toBe("12 Oak Street");
  });

  it("normalizes renewal_status to lowercase", async () => {
    const { parseMyLeaseRow } = await import("../../src/services/rpcContracts.js");
    const parsed = parseMyLeaseRow(makeMyLeaseRow({ renewal_status: "ACTIVE" }));
    expect(parsed.renewal_status).toBe("active");
  });

  it("throws on non-object input", async () => {
    const { parseMyLeaseRow } = await import("../../src/services/rpcContracts.js");
    expect(() => parseMyLeaseRow(null)).toThrow();
    expect(() => parseMyLeaseRow("string")).toThrow();
  });
});
