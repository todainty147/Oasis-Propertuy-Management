"use strict";

// ── Extractor Router ──────────────────────────────────────────────────────────
//
// Decision tree:
//
//  1. If MIME is PDF → try native_pdf first
//     a. If text quality is 'good' or 'ok' → done
//     b. If quality is 'too_short' or 'low_confidence' AND OCR is available
//        → fall back to ocrmypdf_tesseract
//     c. If quality is poor AND OCR is NOT available
//        → return extraction with quality flag + recommended_extractor metadata
//
//  2. If MIME is image → try OCR directly (no native text layer)
//     a. If OCR not available → fail with OcrNotConfiguredError
//
//  3. If MIME is DOCX → unsupported for now
//     → return { unsupported: true } so caller marks as 'failed'
//
//  4. olmOCR and PaddleOCR are future extractors — stubs only.
//     They can be added as new cases in this router without touching the rest
//     of the worker.
// =============================================================================

const nativePdf   = require("./nativePdf");
const ocrFallback = require("./ocrFallback");
const { evaluateExtractionQuality, isQualityPoor } = require("../qualityEvaluator");

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Routes the file to the appropriate extractor and returns a normalised result.
 *
 * @param {Buffer}  fileBuffer   Raw file bytes
 * @param {string}  mimeType     MIME type of the source document
 * @param {string}  requestedExtractor  'auto' | 'native_pdf' | 'ocrmypdf_tesseract' | ...
 * @param {string}  [languageHint]      ISO 639-1 language hint ('en', 'pl', 'de')
 *
 * @returns {{
 *   extractor_used: string,
 *   text: string,
 *   markdown: string|null,
 *   page_count: number|null,
 *   quality: object,
 *   structured_payload: object,
 * }}
 */
async function routeExtraction(fileBuffer, mimeType, requestedExtractor, languageHint) {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      extractor_used: null,
      unsupported: true,
      unsupported_reason: `Unsupported MIME type for extraction: ${mimeType}`,
    };
  }

  // Explicit extractor requested — honour it, no routing logic.
  if (requestedExtractor && requestedExtractor !== "auto") {
    return _runNamedExtractor(requestedExtractor, fileBuffer, mimeType, languageHint);
  }

  // Auto routing.
  if (mimeType === "application/pdf") {
    return _routePdf(fileBuffer, languageHint);
  }

  // Images go straight to OCR.
  if (ocrFallback.supports(mimeType) && ocrFallback.isAvailable()) {
    const lang = _languageHintToTesseract(languageHint);
    const ocrResult = await ocrFallback.extractOcr(fileBuffer, lang);
    const quality = evaluateExtractionQuality(ocrResult.text, { extractor: "ocrmypdf_tesseract" });
    return {
      extractor_used: "ocrmypdf_tesseract",
      text:           ocrResult.text,
      markdown:       null,
      page_count:     ocrResult.pageCount ?? null,
      quality,
      structured_payload: { quality_flag: quality.quality_flag },
    };
  }

  return {
    extractor_used: null,
    unsupported: true,
    unsupported_reason: `No extractor available for MIME type ${mimeType} — OCR not configured`,
  };
}

async function _routePdf(fileBuffer, languageHint) {
  // Step 1: native PDF extraction
  let nativeResult;
  try {
    nativeResult = await nativePdf.extractNativePdf(fileBuffer);
  } catch (err) {
    return {
      extractor_used: "native_pdf",
      error: err.message,
      unsupported: false,
    };
  }

  const quality = evaluateExtractionQuality(nativeResult.text, { extractor: "native_pdf" });

  if (!isQualityPoor(quality)) {
    // Native extraction is good enough.
    return {
      extractor_used: "native_pdf",
      text:           nativeResult.text,
      markdown:       nativeResult.markdown,
      page_count:     nativeResult.pageCount,
      quality,
      structured_payload: { quality_flag: quality.quality_flag, notes: quality.notes },
    };
  }

  // Step 2: quality is poor — try OCR fallback if available.
  if (ocrFallback.isAvailable()) {
    try {
      const lang = _languageHintToTesseract(languageHint);
      const ocrResult = await ocrFallback.extractOcr(fileBuffer, lang);
      const ocrQuality = evaluateExtractionQuality(ocrResult.text, { extractor: "ocrmypdf_tesseract" });
      return {
        extractor_used: "ocrmypdf_tesseract",
        text:           ocrResult.text,
        markdown:       null,
        page_count:     ocrResult.pageCount ?? nativeResult.pageCount,
        quality:        ocrQuality,
        structured_payload: {
          quality_flag:        ocrQuality.quality_flag,
          native_quality_flag: quality.quality_flag,
          notes:               ocrQuality.notes,
        },
      };
    } catch (_ocrErr) {
      // OCR failed — fall through to degrade gracefully.
    }
  }

  // Step 3: degraded path — return the native result with a recommendation.
  return {
    extractor_used: "native_pdf",
    text:           nativeResult.text,
    markdown:       null,
    page_count:     nativeResult.pageCount,
    quality,
    structured_payload: {
      quality_flag:         quality.quality_flag,
      notes:                quality.notes,
      recommended_extractor: "ocrmypdf_tesseract",
      reason:               "low_confidence_or_scanned_pdf",
      ocr_available:        ocrFallback.isAvailable(),
    },
  };
}

async function _runNamedExtractor(name, fileBuffer, mimeType, languageHint) {
  switch (name) {
    case "native_pdf": {
      const result = await nativePdf.extractNativePdf(fileBuffer);
      const quality = evaluateExtractionQuality(result.text, { extractor: "native_pdf" });
      return {
        extractor_used: "native_pdf",
        text:           result.text,
        markdown:       result.markdown,
        page_count:     result.pageCount,
        quality,
        structured_payload: { quality_flag: quality.quality_flag },
      };
    }

    case "ocrmypdf_tesseract": {
      const lang = _languageHintToTesseract(languageHint);
      const result = await ocrFallback.extractOcr(fileBuffer, lang);
      const quality = evaluateExtractionQuality(result.text, { extractor: "ocrmypdf_tesseract" });
      return {
        extractor_used: "ocrmypdf_tesseract",
        text:           result.text,
        markdown:       null,
        page_count:     result.pageCount ?? null,
        quality,
        structured_payload: { quality_flag: quality.quality_flag },
      };
    }

    case "olmocr":
    case "paddleocr":
    case "docling":
      return {
        extractor_used: name,
        unsupported: true,
        unsupported_reason: `Extractor '${name}' is not yet implemented. See docs/DOCUMENT_EXTRACTION_PIPELINE.md.`,
      };

    default:
      return {
        extractor_used: name,
        unsupported: true,
        unsupported_reason: `Unknown extractor: ${name}`,
      };
  }
}

function _languageHintToTesseract(hint) {
  if (!hint) return "eng";
  const map = { en: "eng", pl: "pol", de: "deu", fr: "fra", es: "spa" };
  return map[String(hint).toLowerCase().slice(0, 2)] || "eng";
}

module.exports = { routeExtraction, SUPPORTED_MIME_TYPES };
