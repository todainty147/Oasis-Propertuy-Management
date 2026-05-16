import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
  },
}));

import {
  markLocalStrongPassword,
  recordStrongPassword,
  syncRecentLocalStrongPassword,
} from "../../src/services/passwordSecurityService";

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

describe("passwordSecurityService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.rpc.mockReset();
    installLocalStorage();
  });

  it("records strong passwords against the active account when available", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    await expect(recordStrongPassword("account-1")).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith("record_strong_password", {
      p_account_id: "account-1",
    });
  });

  it("falls back to the account-agnostic recorder when account-scoped recording fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ error: { message: "not a member" } })
      .mockResolvedValueOnce({ error: null });

    await expect(recordStrongPassword("account-1")).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "record_strong_password", {
      p_account_id: "account-1",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "record_own_strong_password");
  });

  it("syncs a recent local strong-password marker back to the server once per throttle window", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    markLocalStrongPassword("user-1");

    await expect(syncRecentLocalStrongPassword("user-1", "account-1")).resolves.toBe(true);
    await expect(syncRecentLocalStrongPassword("user-1", "account-1")).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("record_strong_password", {
      p_account_id: "account-1",
    });
  });
});
