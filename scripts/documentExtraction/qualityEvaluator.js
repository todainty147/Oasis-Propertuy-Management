"use strict";

// Minimum character count for an extraction to be considered useful.
const MIN_CHARS_TOO_SHORT    = 100;
const MIN_CHARS_LOW_CONF     = 500;

// Ratio of whitespace / non-printable characters that suggests OCR noise.
const MAX_NOISE_RATIO = 0.4;

/**
 * Evaluates the quality of extracted text.
 *
 * Returns:
 *   { quality_flag, confidence_score, character_count, notes }
 *
 * quality_flag values:
 *   'too_short'      — fewer than MIN_CHARS_TOO_SHORT characters
 *   'low_confidence' — suspiciously high noise or char count below MIN_CHARS_LOW_CONF
 *   'ok'             — usable but not high-confidence
 *   'good'           — clean text, sufficient length
 *
 * The AI Lease Auditor should treat 'low_confidence' and 'too_short' as signals
 * to request a better extractor (e.g., OCR, olmOCR).
 */
function evaluateExtractionQuality(text, { extractor: _extractor = "native_pdf" } = {}) {
  if (!text || typeof text !== "string") {
    return {
      quality_flag: "too_short",
      confidence_score: 0,
      character_count: 0,
      notes: "No text extracted",
    };
  }

  const charCount = text.length;

  if (charCount < MIN_CHARS_TOO_SHORT) {
    return {
      quality_flag: "too_short",
      confidence_score: 0.1,
      character_count: charCount,
      notes: `Only ${charCount} characters extracted — document may be scanned or image-only`,
    };
  }

  const noiseRatio = _computeNoiseRatio(text);

  if (noiseRatio > MAX_NOISE_RATIO) {
    return {
      quality_flag: "low_confidence",
      confidence_score: Math.max(0.1, 1 - noiseRatio),
      character_count: charCount,
      notes: `High noise ratio (${(noiseRatio * 100).toFixed(1)}%) — may be OCR artefacts or garbled encoding`,
    };
  }

  if (charCount < MIN_CHARS_LOW_CONF) {
    return {
      quality_flag: "low_confidence",
      confidence_score: 0.5,
      character_count: charCount,
      notes: `Short extraction (${charCount} chars) — may be incomplete`,
    };
  }

  const score = Math.min(1, 0.7 + (1 - noiseRatio) * 0.3);

  return {
    quality_flag: charCount > 2000 ? "good" : "ok",
    confidence_score: parseFloat(score.toFixed(4)),
    character_count: charCount,
    notes: null,
  };
}

/**
 * Heuristic noise ratio: proportion of control characters, replacement chars,
 * and long runs of repeated non-alphabetic characters.
 */
function _computeNoiseRatio(text) {
  let noiseChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Control characters (0x00–0x08, 0x0E–0x1F) and replacement char (0xFFFD)
    if ((code >= 0 && code <= 8) || (code >= 14 && code <= 31) || code === 0xfffd) {
      noiseChars++;
    }
  }
  return noiseChars / text.length;
}

/**
 * Returns true if the quality is too poor to be useful for AI downstream.
 * The extractor router uses this to decide whether to fall back to OCR.
 */
function isQualityPoor(quality) {
  return quality.quality_flag === "too_short" || quality.quality_flag === "low_confidence";
}

module.exports = { evaluateExtractionQuality, isQualityPoor };
