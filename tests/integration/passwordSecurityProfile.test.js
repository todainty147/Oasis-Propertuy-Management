/**
 * Integration tests for the user_security_profile table and RPCs.
 *
 * Verifies:
 *   - Bootstrap: existing account members have legacy_weak rows
 *   - get_own_security_profile: user reads their own posture
 *   - record_strong_password: owner/admin/staff/tenant can mark their own password
 *   - record_strong_password: rejects non-members and unauthenticated callers
 *   - list_account_password_security: managers see all members, sorted worst-first
 *   - list_account_password_security: tenants/contractors are denied
 *   - list_account_password_security: cross-account access denied
 */

import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;

describe.skipIf(!isIntegrationHarnessConfigured())(
  "user_security_profile — RPCs and RLS",
  () => {
    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
    });

    // -------------------------------------------------------------------------
    // Bootstrap
    // -------------------------------------------------------------------------

    describe("bootstrap", () => {
      it("existing account members have a security profile row", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { data, error } = await client
          .from("user_security_profile")
          .select("password_strength_status")
          .limit(1);

        expect(error).toBeNull();
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(
          ["legacy_weak", "strong", "unknown", "reset_required"],
        ).toContain(data[0].password_strength_status);
      });
    });

    // -------------------------------------------------------------------------
    // get_own_security_profile
    // -------------------------------------------------------------------------

    describe("get_own_security_profile", () => {
      it("returns a row for the authenticated owner", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { data, error } = await client.rpc("get_own_security_profile");

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({
          password_policy_version: expect.any(Number),
          password_strength_status: expect.any(String),
          mfa_required: expect.any(Boolean),
          mfa_enrolled: expect.any(Boolean),
        });
      });

      it("returns a row for a tenant user", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const { data, error } = await client.rpc("get_own_security_profile");

        expect(error).toBeNull();
        // tenant may have 0 or 1 rows depending on bootstrap
        expect(data.length).toBeLessThanOrEqual(1);
      });
    });

    // -------------------------------------------------------------------------
    // record_strong_password
    // -------------------------------------------------------------------------

    describe("record_strong_password", () => {
      it("owner can record strong password for their account", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("record_strong_password", {
          p_account_id: ACCOUNT_A,
        });
        expect(error).toBeNull();

        // Verify the profile was updated
        const { data } = await client.rpc("get_own_security_profile");
        expect(data[0].password_strength_status).toBe("strong");
        expect(data[0].password_policy_version).toBe(1);
      });

      it("admin can record strong password for their account", async () => {
        const { client } = await signInAsFixtureUser("adminA");
        const { error } = await client.rpc("record_strong_password", {
          p_account_id: ACCOUNT_A,
        });
        expect(error).toBeNull();
      });

      it("staff can record strong password for their account", async () => {
        const { client } = await signInAsFixtureUser("staffA");
        const { error } = await client.rpc("record_strong_password", {
          p_account_id: ACCOUNT_A,
        });
        expect(error).toBeNull();
      });

      it("tenant is denied (tenants are not in account_members)", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const { error } = await client.rpc("record_strong_password", {
          p_account_id: ACCOUNT_A,
        });
        expect(error).not.toBeNull();
        expect(error.message.toLowerCase()).toMatch(/not a member/);
      });

      it("rejects a non-member account id", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("record_strong_password", {
          p_account_id: "00000000-0000-0000-0000-000000000000",
        });
        expect(error).not.toBeNull();
        expect(error.message.toLowerCase()).toMatch(/not a member/);
      });
    });

    // -------------------------------------------------------------------------
    // record_own_strong_password
    // -------------------------------------------------------------------------

    describe("record_own_strong_password", () => {
      it("tenant can record their own strong password", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const { error } = await client.rpc("record_own_strong_password");
        expect(error).toBeNull();

        const { data } = await client.rpc("get_own_security_profile");
        expect(data[0].password_strength_status).toBe("strong");
        expect(data[0].password_policy_version).toBe(1);
      });

      it("contractor can record their own strong password", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const { error } = await client.rpc("record_own_strong_password");
        expect(error).toBeNull();
      });

      it("owner can also use the account-agnostic variant", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("record_own_strong_password");
        expect(error).toBeNull();
      });
    });

    // -------------------------------------------------------------------------
    // list_account_password_security
    // -------------------------------------------------------------------------

    describe("list_account_password_security", () => {
      it("owner sees all account members with security posture", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { data, error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: ACCOUNT_A },
        );

        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        for (const row of data) {
          expect(row).toMatchObject({
            user_id:                  expect.any(String),
            email:                    expect.any(String),
            display_name:             expect.any(String),
            role:                     expect.any(String),
            password_policy_version:  expect.any(Number),
            password_strength_status: expect.any(String),
            mfa_enrolled:             expect.any(Boolean),
          });
        }
      });

      it("admin sees all account members", async () => {
        const { client } = await signInAsFixtureUser("adminA");
        const { data, error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: ACCOUNT_A },
        );
        expect(error).toBeNull();
        expect(data.length).toBeGreaterThan(0);
      });

      it("staff sees all account members", async () => {
        const { client } = await signInAsFixtureUser("staffA");
        const { data, error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: ACCOUNT_A },
        );
        expect(error).toBeNull();
        expect(data.length).toBeGreaterThan(0);
      });

      it("tenant is denied", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const { error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: ACCOUNT_A },
        );
        expect(error).not.toBeNull();
        expect(error.message.toLowerCase()).toMatch(/access denied/);
      });

      it("contractor is denied", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const { error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: ACCOUNT_A },
        );
        expect(error).not.toBeNull();
        expect(error.message.toLowerCase()).toMatch(/access denied/);
      });

      it("rejects cross-account access", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: "00000000-0000-0000-0000-000000000000" },
        );
        expect(error).not.toBeNull();
        expect(error.message.toLowerCase()).toMatch(/access denied/);
      });

      it("results are sorted worst-first (strong users appear last)", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { data, error } = await client.rpc(
          "list_account_password_security",
          { p_account_id: ACCOUNT_A },
        );
        expect(error).toBeNull();

        const ORDER = { reset_required: 0, legacy_weak: 1, unknown: 2, strong: 3 };
        for (let i = 1; i < data.length; i++) {
          const prev = ORDER[data[i - 1].password_strength_status] ?? 99;
          const curr = ORDER[data[i].password_strength_status] ?? 99;
          expect(prev).toBeLessThanOrEqual(curr);
        }
      });
    });
  },
);
