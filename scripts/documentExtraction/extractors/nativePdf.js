"use strict";

// Lazy-load pdf-parse so missing the dependency produces a clear error rather
// than crashing the entire worker at startup.
let pdfParse = null;

function loadPdfParse() {
  if (pdfParse) return pdfParse;
  try {
    pdfParse = require("pdf-parse");
    return pdfParse;
  } catch (_err) {
    throw new Error(
      "pdf-parse is not installed. " +
      "Run: cd scripts/documentExtraction && npm install"
    );
  }
}

/**
 * Extracts text from a born-digital PDF using pdf-parse.
 *
 * @param {Buffer} fileBuffer  Raw PDF bytes
 * @returns {{ text: string, pageCount: number, markdown: string|null }}
 *
 * Only returns text that is selectable (embedded fonts).
 * Scanned / image-only PDFs will return very little or no text — the caller
 * should then use evaluateExtractionQuality() and fall back to OCR if needed.
 */
async function extractNativePdf(fileBuffer) {
  const parse = loadPdfParse();

  let result;
  try {
    result = await parse(fileBuffer, {
      // Do not render page-level images — we only want text
      max: 0,
    });
  } catch (err) {
    throw new Error(`pdf-parse failed: ${err.message}`);
  }

  const rawText  = result.text || "";
  const pageCount = result.numpages || 0;

  // Normalise whitespace: collapse multiple blank lines to one, trim leading/trailing
  const normalisedText = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: normalisedText,
    pageCount,
    markdown: null,  // native extraction does not produce structured markdown
    info: result.info || {},
  };
}

/**
 * Returns true if this extractor supports the given MIME type.
 */
function supports(mimeType) {
  return mimeType === "application/pdf";
}

module.exports = { extractNativePdf, supports };
