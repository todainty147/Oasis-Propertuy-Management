/**
 * E-163 — Core handler for verify-work-order-photo-hash (pure, no Deno imports).
 *
 * All external dependencies are injected so the handler can be unit-tested
 * with mocked clients in Node/Vitest. The Deno index.ts passes the real clients.
 *
 * Authorization ordering (load-bearing — do not reorder):
 *   1. userClient attachment lookup (caller-scoped, RLS under caller's JWT) → reject if not found
 *   2. adminClient path resolution                  ← only after step 1 succeeds
 *   3. adminClient storage.download                 ← only after step 1 succeeds
 *   4. adminClient rpc record_work_order_photo_hash_verification  ← only after 1-3 succeed
 *
 * The caller NEVER supplies a storage path. The path is always resolved from
 * the trusted DB row keyed by attachment_id (step 2). This prevents the caller
 * from redirecting the service-role reader to an arbitrary storage object.
 *
 * @param {{
 *   attachmentId: string,
 *   userClient:   object,   // Supabase client built from caller's JWT — enforces RLS
 *   adminClient:  object,   // Supabase service-role client — used ONLY after auth
 *   subtle:       SubtleCrypto
 * }} deps
 * @returns {Promise<Response>}
 */
export async function verifyWorkOrderPhotoHashHandler({
  attachmentId,
  userClient,
  adminClient,
  subtle,
}) {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!attachmentId || !UUID_RE.test(attachmentId)) {
    return json({ error: "attachmentId must be a valid UUID" }, 400);
  }

  // ── Layer 1b: Product authorization ───────────────────────────────────────
  // userClient runs under the caller's JWT; RLS decides visibility.
  // If the caller cannot SELECT this row they are not authorized — 403.
  // adminClient is NOT used here; using it would bypass product authorization.
  const { data: authRow, error: authError } = await userClient
    .from("work_order_attachments")
    .select("id, content_hash_client_asserted, hash_trust")
    .eq("id", attachmentId)
    .maybeSingle();

  if (authError || !authRow) {
    return json({ error: "Attachment not found or not accessible" }, 403);
  }

  if (!authRow.content_hash_client_asserted) {
    return json({ error: "Attachment has no client-asserted hash to verify" }, 400);
  }

  // Terminal states are final this pass — skip gracefully
  if (
    authRow.hash_trust === "verified" ||
    authRow.hash_trust === "verification_failed"
  ) {
    return json({
      ok: true,
      attachmentId,
      hashTrust: authRow.hash_trust,
      skipped: true,
      message: "Attachment is already in a terminal verification state",
    });
  }

  // ── Layer 2: Path resolution from trusted DB row ───────────────────────────
  // adminClient is introduced here — only after Layer 1b passes.
  // The path is resolved from the authoritative DB row (attachment_id key).
  // The caller never supplies a storage path.
  const { data: pathRow, error: pathError } = await adminClient
    .from("work_order_attachments")
    .select(
      "id, account_id, work_order_id, storage_bucket, storage_path, content_hash_client_asserted"
    )
    .eq("id", attachmentId)
    .single();

  if (pathError || !pathRow) {
    return json({ error: "Failed to resolve attachment path for verification" }, 500);
  }

  // ── Read stored bytes (service role, trusted path only) ───────────────────
  const { data: blob, error: readError } = await adminClient.storage
    .from(pathRow.storage_bucket)
    .download(pathRow.storage_path);

  if (readError || !blob) {
    const errMsg = readError?.message ?? "storage download returned no data";
    try {
      await adminClient.rpc("record_work_order_photo_hash_verification", {
        p_attachment_id: attachmentId,
        p_server_hash: null,
        p_match: null,
        p_error: errMsg,
      });
    } catch {
      // Best-effort transient recording; the sweep will retry
    }
    return json(
      { error: "Verification postponed — storage read failed; retryable", retryable: true },
      503
    );
  }

  // ── SHA-256 recompute over stored bytes ───────────────────────────────────
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await subtle.digest("SHA-256", buffer);
  const serverHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const match = serverHash === pathRow.content_hash_client_asserted;

  // ── Record result atomically (state + provenance event) ───────────────────
  const { error: recordError } = await adminClient.rpc(
    "record_work_order_photo_hash_verification",
    {
      p_attachment_id: attachmentId,
      p_server_hash: serverHash,
      p_match: match,
      p_error: null,
    }
  );

  if (recordError) {
    return json({ error: "Failed to record hash verification result" }, 500);
  }

  return json({
    ok: true,
    attachmentId,
    hashTrust: match ? "verified" : "verification_failed",
    match,
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
