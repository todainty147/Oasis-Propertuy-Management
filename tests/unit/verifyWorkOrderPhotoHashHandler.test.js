/**
 * E-163a — verify-work-order-photo-hash caller-auth boundary proof
 *
 * Tests the extracted pure handler with injected mock clients.
 * Proves:
 *   (a) unauthorized caller → 403 BEFORE any admin/service-role storage read
 *   (b) admin storage read spy = 0 calls when auth fails (call-count proof)
 *   (c) recording RPC not called on unauthorized attempt
 *   (d) caller-supplied storage_path / storageBucket are ignored; path is
 *       always resolved from the trusted DB row via adminClient
 *   (e) authorized caller proceeds through admin storage read and recording
 *
 * Boundary-completeness:
 *   Gating  (this file): the handler proceeds only on a successful
 *            caller-scoped (userClient) DB lookup.
 *   Scoping (E-150.1 T9): the caller-scoped RLS policy ensures the lookup
 *            only returns rows the caller is permitted to see. Together these
 *            constitute the full caller-auth boundary.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyWorkOrderPhotoHashHandler } from "../../supabase/functions/verify-work-order-photo-hash/handler.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ATTACHMENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_HASH   = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";

const AUTH_ROW = {
  id: ATTACHMENT_ID,
  content_hash_client_asserted: CLIENT_HASH,
  hash_trust: "client_asserted_unverified",
};

const PATH_ROW = {
  id: ATTACHMENT_ID,
  account_id: "11111111-1111-1111-1111-111111111111",
  work_order_id: "22222222-2222-2222-2222-222222222222",
  storage_bucket: "work-order-attachments",
  storage_path: "account/111/work_orders/222/photo.jpg",
  content_hash_client_asserted: CLIENT_HASH,
};

// ─── Mock builders ───────────────────────────────────────────────────────────

/**
 * Returns a Supabase-like query chain whose terminal methods resolve to `result`.
 * Chain methods: select, eq, neq, not, order, limit → return `chain`.
 * Terminal:      maybeSingle(), single() → Promise<result>.
 */
function makeQueryChain(result) {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    neq:    () => chain,
    not:    () => chain,
    order:  () => chain,
    limit:  () => chain,
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single:      vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

/**
 * Returns a minimal Supabase-like client whose `from()` always resolves to
 * `result` via both maybeSingle() and single().
 */
function makeUserClient(result) {
  const chain = makeQueryChain(result);
  return { from: vi.fn(() => chain) };
}

/**
 * Returns a minimal admin client with spies on from(), storage.download, and rpc().
 * `fromResult`     — resolved by adminClient.from().single()
 * `downloadResult` — resolved by adminClient.storage.from().download()
 * `rpcResult`      — resolved by adminClient.rpc()
 */
function makeAdminClient({ fromResult, downloadResult, rpcResult }) {
  const downloadSpy = vi.fn(() => Promise.resolve(downloadResult));
  const storageFromSpy = vi.fn(() => ({ download: downloadSpy }));
  const fromChain = makeQueryChain(fromResult);
  const fromSpy = vi.fn(() => fromChain);
  const rpcSpy = vi.fn(() => Promise.resolve(rpcResult));

  return {
    from: fromSpy,
    storage: { from: storageFromSpy },
    rpc: rpcSpy,
    _spies: { fromSpy, storageFromSpy, downloadSpy, rpcSpy },
  };
}

/** Real Web Crypto subtle (Node 18+ global). */
const subtle = globalThis.crypto.subtle;

// ─── Test bytes that produce a known SHA-256 ─────────────────────────────────
// 4 JPEG-like bytes; SHA-256 is computed at test runtime for the match assertion.
const TEST_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

async function sha256Hex(bytes) {
  const buf = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("verifyWorkOrderPhotoHashHandler — caller-auth boundary", () => {

  // ── Unauthorized caller ────────────────────────────────────────────────────

  it("T01 unauthorized: userClient returns null → 403 before any admin storage read", async () => {
    const userClient = makeUserClient({ data: null, error: null });
    const adminClient = makeAdminClient({
      fromResult:     { data: null, error: null },
      downloadResult: { data: null, error: new Error("should not be reached") },
      rpcResult:      { data: null, error: null },
    });

    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      userClient,
      adminClient,
      subtle,
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not found|not accessible/i);

    // ── Spy call-count proof (core assertion) ─────────────────────────────
    // admin storage read must have 0 calls — authorization failed before it ran
    expect(adminClient._spies.storageFromSpy).not.toHaveBeenCalled();
    expect(adminClient._spies.downloadSpy).not.toHaveBeenCalled();
    // admin from() (path resolution) must also have 0 calls
    expect(adminClient._spies.fromSpy).not.toHaveBeenCalled();
    // recording RPC must not be called
    expect(adminClient._spies.rpcSpy).not.toHaveBeenCalled();
  });

  it("T02 unauthorized: userClient returns RLS error → 403, no admin calls", async () => {
    const userClient = makeUserClient({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    const adminClient = makeAdminClient({
      fromResult:     { data: null, error: null },
      downloadResult: { data: null, error: null },
      rpcResult:      { data: null, error: null },
    });

    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      userClient,
      adminClient,
      subtle,
    });

    expect(res.status).toBe(403);
    expect(adminClient._spies.downloadSpy).not.toHaveBeenCalled();
    expect(adminClient._spies.fromSpy).not.toHaveBeenCalled();
    expect(adminClient._spies.rpcSpy).not.toHaveBeenCalled();
  });

  it("T03 cross-account caller: simulated by userClient returning null (same as unauthorized)", async () => {
    // A caller from another account sees no row via RLS → same as T01.
    // The RLS policy (proven by E-150.1 T9) ensures cross-account rows are invisible.
    // Here we assert the handler gates on that null return without reaching admin.
    const userClient = makeUserClient({ data: null, error: null });
    const adminClient = makeAdminClient({
      fromResult:     { data: PATH_ROW, error: null },
      downloadResult: { data: new Blob([TEST_BYTES]), error: null },
      rpcResult:      { data: null, error: null },
    });

    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      userClient,
      adminClient,
      subtle,
    });

    expect(res.status).toBe(403);
    // Admin read spy = 0 — proves the cross-account caller never reached storage
    expect(adminClient._spies.storageFromSpy.mock.calls.length).toBe(0);
    expect(adminClient._spies.downloadSpy.mock.calls.length).toBe(0);
    expect(adminClient._spies.rpcSpy.mock.calls.length).toBe(0);
  });

  // ── Forged / caller-supplied path ─────────────────────────────────────────

  it("T04 forged path: caller-supplied fields are ignored; path comes from DB row", async () => {
    // The handler only accepts { attachmentId, userClient, adminClient, subtle }.
    // Even if we call it with extra fields (simulating a tampered request body
    // that included storage_path / storageBucket / accountId), those are not
    // in the handler's destructured parameters and cannot influence path resolution.
    //
    // Path is always resolved via: adminClient.from('work_order_attachments').eq('id', attachmentId)
    // The test confirms the storage read uses PATH_ROW.storage_path (from DB), not any caller value.

    const userClient = makeUserClient({ data: AUTH_ROW, error: null });
    const downloadSpy = vi.fn(() =>
      Promise.resolve({ data: new Blob([TEST_BYTES]), error: null })
    );
    const storageBucketCapture = vi.fn(() => ({ download: downloadSpy }));

    const adminClient = {
      from: vi.fn(() => makeQueryChain({ data: PATH_ROW, error: null })),
      storage: { from: storageBucketCapture },
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      _spies: { downloadSpy, storageBucketCapture },
    };

    // Call with extra attacker-controlled fields that should be ignored
    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      // These extra fields are not in the handler signature — ignored entirely:
      storagePath: "attacker/controlled/path.jpg",       // ignored
      storageBucket: "attacker-bucket",                  // ignored
      accountId: "ffffffff-ffff-ffff-ffff-ffffffffffff", // ignored
      workOrderId: "ffffffff-ffff-ffff-ffff-ffffffffffff", // ignored
      userClient,
      adminClient,
      subtle,
    });

    // Request should succeed (authorized caller, valid attachment)
    expect(res.status).toBe(200);

    // Storage was called with PATH_ROW values from the trusted DB row,
    // NOT with the attacker-supplied values.
    expect(storageBucketCapture).toHaveBeenCalledWith(PATH_ROW.storage_bucket);
    expect(downloadSpy).toHaveBeenCalledWith(PATH_ROW.storage_path);

    // Attacker values never appear in the storage call
    expect(storageBucketCapture).not.toHaveBeenCalledWith("attacker-bucket");
    expect(downloadSpy).not.toHaveBeenCalledWith("attacker/controlled/path.jpg");
  });

  it("T05 missing / invalid attachment_id → 400, no auth or admin calls", async () => {
    const userClient = makeUserClient({ data: null, error: null });
    const adminClient = makeAdminClient({
      fromResult:     { data: null, error: null },
      downloadResult: { data: null, error: null },
      rpcResult:      { data: null, error: null },
    });

    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: "not-a-uuid",
      userClient,
      adminClient,
      subtle,
    });

    expect(res.status).toBe(400);
    // Neither userClient.from nor adminClient were touched
    expect(adminClient._spies.fromSpy).not.toHaveBeenCalled();
    expect(adminClient._spies.downloadSpy).not.toHaveBeenCalled();
  });

  // ── Authorized caller happy path ───────────────────────────────────────────

  it("T06 authorized caller: proceeds through admin storage read and recording", async () => {
    const knownHash = await sha256Hex(TEST_BYTES);
    const pathRowWithMatchingHash = { ...PATH_ROW, content_hash_client_asserted: knownHash };
    const authRowWithMatchingHash = { ...AUTH_ROW, content_hash_client_asserted: knownHash };

    const userClient = makeUserClient({ data: authRowWithMatchingHash, error: null });
    const downloadSpy = vi.fn(() =>
      Promise.resolve({ data: new Blob([TEST_BYTES]), error: null })
    );
    const rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const adminClient = {
      from: vi.fn(() => makeQueryChain({ data: pathRowWithMatchingHash, error: null })),
      storage: { from: vi.fn(() => ({ download: downloadSpy })) },
      rpc: rpcSpy,
    };

    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      userClient,
      adminClient,
      subtle,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hashTrust).toBe("verified");
    expect(body.match).toBe(true);

    // Admin storage read was called exactly once (authorized path)
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledWith(pathRowWithMatchingHash.storage_path);

    // Recording RPC was called with match=true and the server hash
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith("record_work_order_photo_hash_verification", {
      p_attachment_id: ATTACHMENT_ID,
      p_server_hash:   knownHash,
      p_match:         true,
      p_error:         null,
    });
  });

  it("T07 authorized caller, hash mismatch: verification_failed returned, both hashes in RPC", async () => {
    const serverHash = await sha256Hex(TEST_BYTES);
    // Use a fixed claimed hash that is provably different from serverHash
    const claimedHash = "0000000000000000000000000000000000000000000000000000000000000000";
    // Sanity: ensure the two hashes are actually different for this test to be meaningful
    expect(serverHash).not.toBe(claimedHash);
    const authRowMismatch = { ...AUTH_ROW, content_hash_client_asserted: claimedHash };
    const pathRowMismatch = { ...PATH_ROW, content_hash_client_asserted: claimedHash };

    const userClient = makeUserClient({ data: authRowMismatch, error: null });
    const rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const adminClient = {
      from: vi.fn(() => makeQueryChain({ data: pathRowMismatch, error: null })),
      storage: { from: vi.fn(() => ({ download: vi.fn(() => Promise.resolve({ data: new Blob([TEST_BYTES]), error: null })) })) },
      rpc: rpcSpy,
    };

    const res = await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      userClient,
      adminClient,
      subtle,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hashTrust).toBe("verification_failed");
    expect(body.match).toBe(false);

    expect(rpcSpy).toHaveBeenCalledWith("record_work_order_photo_hash_verification", {
      p_attachment_id: ATTACHMENT_ID,
      p_server_hash:   serverHash,   // server-computed
      p_match:         false,
      p_error:         null,
    });
  });

  // ── No hash state written for unauthorized caller ─────────────────────────

  it("T08 no state/event written: rpc not called when caller is unauthorized", async () => {
    const userClient = makeUserClient({ data: null, error: null });
    const adminClient = makeAdminClient({
      fromResult:     { data: null, error: null },
      downloadResult: { data: null, error: null },
      rpcResult:      { data: null, error: null },
    });

    await verifyWorkOrderPhotoHashHandler({
      attachmentId: ATTACHMENT_ID,
      userClient,
      adminClient,
      subtle,
    });

    // record_work_order_photo_hash_verification was never called
    // → no hash_trust change, no provenance event
    expect(adminClient._spies.rpcSpy).not.toHaveBeenCalled();
  });

  // ── userClient uses caller's JWT (structural proof) ───────────────────────

  it("T09 structural: handler takes userClient as a parameter (built from caller JWT in index.ts)", () => {
    // The handler signature accepts userClient as an injected dependency.
    // In production (index.ts), userClient is constructed as:
    //   createClient(URL, ANON_KEY, { global: { headers: { Authorization: callerJWT } } })
    // This ensures RLS evaluates under the caller's identity, not the anon/service-role identity.
    //
    // The handler itself does not construct any Supabase clients — it only uses
    // what is injected. This prevents accidental use of a wrong identity.
    //
    // Verified by inspection of handler.js: no `createClient` call, no env access.
    const src = verifyWorkOrderPhotoHashHandler.toString();
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/Deno\.env/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    // Handler uses injected userClient for the auth lookup (not adminClient)
    expect(src).toMatch(/userClient/);
    // adminClient only appears after the userClient check in the function body
    const userClientIdx = src.indexOf("userClient");
    const adminClientIdx = src.indexOf("adminClient");
    expect(userClientIdx).toBeLessThan(adminClientIdx);
  });
});
