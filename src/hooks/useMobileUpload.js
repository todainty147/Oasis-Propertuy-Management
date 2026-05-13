/**
 * useMobileUpload — reusable upload hook with progress tracking and retry.
 *
 * Wraps any upload function (maintenance, work order, document) and adds:
 *  - per-file progress tracking (simulated via XHR or chunked reporting)
 *  - retry on failure (up to maxRetries attempts)
 *  - friendly error messages
 *  - file size and type validation before upload begins
 *
 * Security guardrails:
 *  - Does NOT bypass RLS — calls the same service functions as desktop
 *  - Does NOT cache uploaded files locally
 *  - Respects maxBytes / allowedMimeTypes from caller
 */
import { useState, useCallback, useRef } from "react";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_RETRIES = 2;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const ALLOWED_DOCUMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const UPLOAD_PRESETS = {
  maintenancePhoto: {
    accept: "image/*",
    allowedMimeTypes: ALLOWED_IMAGE_TYPES,
    maxBytes: 15 * 1024 * 1024,
    maxFiles: 10,
    label: "Add photos",
    hint: "JPEG, PNG, WEBP, HEIC — up to 15 MB each",
  },
  workOrderPhoto: {
    accept: "image/*",
    allowedMimeTypes: ALLOWED_IMAGE_TYPES,
    maxBytes: 15 * 1024 * 1024,
    maxFiles: 10,
    label: "Upload work photos",
    hint: "Take a photo or choose from your library — up to 15 MB each",
  },
  invoiceOrQuote: {
    accept: "image/*,application/pdf",
    allowedMimeTypes: ALLOWED_DOCUMENT_TYPES,
    maxBytes: 15 * 1024 * 1024,
    maxFiles: 5,
    label: "Upload invoice or quote",
    hint: "PDF or photo — up to 15 MB",
  },
  document: {
    accept: "image/*,application/pdf,.doc,.docx",
    allowedMimeTypes: ALLOWED_DOCUMENT_TYPES,
    maxBytes: 20 * 1024 * 1024,
    maxFiles: 5,
    label: "Upload document",
    hint: "PDF, Word, or image — up to 20 MB",
  },
};

/**
 * Validate files before upload.
 * Returns { valid: File[], errors: string[] }
 */
function validateFiles(files, { maxBytes, maxFiles, allowedMimeTypes }) {
  const valid = [];
  const errors = [];

  const list = Array.from(files || []);

  if (list.length === 0) {
    errors.push("No files selected.");
    return { valid, errors };
  }

  if (list.length > maxFiles) {
    errors.push(`You can upload up to ${maxFiles} files at once.`);
    return { valid, errors };
  }

  for (const file of list) {
    if (allowedMimeTypes && !allowedMimeTypes.includes(file.type)) {
      errors.push(`${file.name}: file type not allowed.`);
      continue;
    }
    if (file.size > maxBytes) {
      const mb = (maxBytes / 1024 / 1024).toFixed(0);
      errors.push(`${file.name}: exceeds the ${mb} MB limit.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}: file is empty.`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}

/**
 * @param {Object} options
 * @param {Function} options.uploadFn   - async (files) => uploaded[] — the actual service function
 * @param {Object}  options.preset      - one of UPLOAD_PRESETS or a custom config
 * @param {number}  [options.maxRetries=2]
 * @param {Function} [options.onSuccess] - called with uploaded[] after success
 * @param {Function} [options.onError]   - called with Error after all retries exhausted
 */
export function useMobileUpload({
  uploadFn,
  preset = UPLOAD_PRESETS.document,
  maxRetries = DEFAULT_MAX_RETRIES,
  onSuccess,
  onError,
} = {}) {
  const [state, setState] = useState({
    status: "idle",    // idle | validating | uploading | success | error
    progress: 0,       // 0-100 (simulated — Supabase JS SDK doesn't stream progress)
    error: null,
    uploaded: [],
  });

  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = false;
    setState({ status: "idle", progress: 0, error: null, uploaded: [] });
  }, []);

  const upload = useCallback(
    async (files) => {
      abortRef.current = false;

      // 1. Validate
      setState({ status: "validating", progress: 0, error: null, uploaded: [] });

      const cfg = {
        maxBytes:        preset.maxBytes  ?? DEFAULT_MAX_BYTES,
        maxFiles:        preset.maxFiles  ?? DEFAULT_MAX_FILES,
        allowedMimeTypes: preset.allowedMimeTypes ?? null,
      };

      const { valid, errors } = validateFiles(files, cfg);

      if (errors.length > 0) {
        const err = new Error(errors.join(" "));
        setState({ status: "error", progress: 0, error: err.message, uploaded: [] });
        onError?.(err);
        return;
      }

      // 2. Upload with retry
      setState((s) => ({ ...s, status: "uploading", progress: 10 }));

      let attempt = 0;
      let lastErr = null;

      while (attempt <= maxRetries) {
        if (abortRef.current) break;

        try {
          // Simulate progress increments while the actual upload runs
          const progressTimer = setInterval(() => {
            setState((s) => {
              if (s.progress >= 85) { clearInterval(progressTimer); return s; }
              return { ...s, progress: Math.min(s.progress + 12, 85) };
            });
          }, 400);

          const uploaded = await uploadFn(valid);
          clearInterval(progressTimer);

          if (abortRef.current) break;

          setState({ status: "success", progress: 100, error: null, uploaded });
          onSuccess?.(uploaded);
          return;
        } catch (err) {
          lastErr = err;
          attempt += 1;

          if (attempt <= maxRetries) {
            // Brief back-off before retry
            await new Promise((r) => setTimeout(r, 800 * attempt));
            setState((s) => ({ ...s, progress: 10 }));
          }
        }
      }

      const errMsg =
        lastErr?.message || "Upload failed. Please check your connection and try again.";

      setState({ status: "error", progress: 0, error: errMsg, uploaded: [] });
      onError?.(lastErr || new Error(errMsg));
    },
    [uploadFn, preset, maxRetries, onSuccess, onError],
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    setState({ status: "idle", progress: 0, error: null, uploaded: [] });
  }, []);

  return {
    ...state,
    upload,
    reset,
    cancel,
    isIdle:      state.status === "idle",
    isUploading: state.status === "uploading" || state.status === "validating",
    isSuccess:   state.status === "success",
    isError:     state.status === "error",
    /** Preset config for file picker wiring */
    accept:  preset.accept,
    label:   preset.label,
    hint:    preset.hint,
  };
}
