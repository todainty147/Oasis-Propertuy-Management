"use strict";

const crypto = require("crypto");

/**
 * Computes a SHA-256 hex digest of a Buffer or Uint8Array.
 * Used to detect document changes between extraction runs.
 *
 * The unique constraint on document_extractions is
 * (account_id, document_id, extractor, source_hash), so a new source_hash
 * from a changed file will create a new extraction row rather than
 * overwriting the previous one.
 */
function computeSourceHash(buffer) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error("computeSourceHash: expected Buffer or Uint8Array");
  }
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = { computeSourceHash };
