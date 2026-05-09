"use strict";

// ── OCR Fallback — OCRmyPDF / Tesseract ──────────────────────────────────────
//
// This module is a STUB for the OCR fallback pathway.
//
// The real implementation would:
//   1. Write the PDF buffer to a temp file.
//   2. Run `ocrmypdf <input.pdf> <output.pdf>` via child_process.spawn.
//   3. Parse the output PDF with nativePdf.js to get selectable text.
//   4. Clean up temp files.
//
// Prerequisites (not included in this repo):
//   • OCRmyPDF:  pip install ocrmypdf
//   • Tesseract: apt-get install tesseract-ocr (+ language packs as needed)
//   • Or on macOS: brew install ocrmypdf tesseract
//
// See docs/DOCUMENT_EXTRACTION_PIPELINE.md for setup instructions.
//
// To add OCR support:
//   1. Install the system dependencies above.
//   2. Implement the extractOcr() body below.
//   3. Set OCR_FALLBACK_ENABLED=true in the worker environment.
// =============================================================================

const OCR_ENABLED = process.env.OCR_FALLBACK_ENABLED === "true";

/**
 * Attempts OCR extraction on the given PDF buffer.
 *
 * Currently a stub — returns a clear error if OCR binaries are not configured.
 * The worker treats this as a graceful degradation, not a crash.
 *
 * @param {Buffer}  fileBuffer   Raw PDF bytes
 * @param {string}  [language]   ISO 639-1 hint ('eng', 'pol', 'deu', etc.)
 * @returns {{ text: string, pageCount: number, markdown: null }}
 */
async function extractOcr(fileBuffer, _language = "eng") {
  if (!OCR_ENABLED) {
    throw new OcrNotConfiguredError(
      "OCR fallback is not configured in this environment. " +
      "Install OCRmyPDF + Tesseract and set OCR_FALLBACK_ENABLED=true to enable. " +
      "See docs/DOCUMENT_EXTRACTION_PIPELINE.md for setup instructions."
    );
  }

  // TODO: implement when OCRmyPDF is available in the deployment environment.
  // const { spawn } = require("child_process");
  // const os = require("os");
  // const path = require("path");
  // const fs = require("fs");
  // ...
  throw new OcrNotConfiguredError("OCR implementation pending — set OCR_FALLBACK_ENABLED=true and implement extractOcr().");
}

/**
 * Returns true if this extractor is available in the current environment.
 */
function isAvailable() {
  return OCR_ENABLED;
}

/**
 * Returns true if this extractor supports the given MIME type.
 * OCR can handle PDFs and images.
 */
function supports(mimeType) {
  return (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}

class OcrNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "OcrNotConfiguredError";
    this.code = "OCR_NOT_CONFIGURED";
  }
}

module.exports = { extractOcr, isAvailable, supports, OcrNotConfiguredError };
