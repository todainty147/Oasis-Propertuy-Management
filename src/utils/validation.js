const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED_RE = /^[0-9+\-()\s.]+$/;

export function isBlank(value) {
  return !String(value ?? "").trim();
}

export function assertRequiredText(value, message = "Field required") {
  if (isBlank(value)) throw new Error(message);
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function assertMaxLength(value, max, message) {
  if (value == null) return;
  if (String(value).length > Number(max || 0)) {
    throw new Error(message || `Maximum ${max} characters allowed`);
  }
}

export function assertEmail(email, message = "Valid email required") {
  const clean = normalizeText(email).toLowerCase();
  if (!EMAIL_RE.test(clean)) throw new Error(message);
  return clean;
}

export function assertPhone(phone, { required = false, message } = {}) {
  const value = normalizeText(phone);
  if (!value) {
    if (required) throw new Error(message || "Phone number required");
    return "";
  }
  if (!PHONE_ALLOWED_RE.test(value)) {
    throw new Error(message || "Invalid phone number format");
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) {
    throw new Error(message || "Invalid phone number length");
  }
  return value;
}

export function assertAmount(
  amount,
  {
    allowNull = false,
    min = 0,
    message = "Invalid amount",
  } = {}
) {
  if (amount === "" || amount === null || amount === undefined) {
    if (allowNull) return null;
    throw new Error(message);
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n < min) throw new Error(message);
  return n;
}

export function assertFiles(
  files,
  {
    maxFiles = 10,
    maxBytes = 10 * 1024 * 1024,
    allowedMimeTypes = null,
    message = "Invalid file upload",
  } = {}
) {
  const list = Array.from(files || []).filter(Boolean);
  if (list.length === 0) return [];
  if (list.length > maxFiles) {
    throw new Error(`Too many files (max ${maxFiles})`);
  }

  for (const file of list) {
    if (!file?.name) throw new Error(message);
    if (Number.isFinite(maxBytes) && Number(file.size || 0) > maxBytes) {
      throw new Error(`File too large: ${file.name}`);
    }
    if (
      Array.isArray(allowedMimeTypes) &&
      allowedMimeTypes.length > 0 &&
      file.type &&
      !allowedMimeTypes.includes(file.type)
    ) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }
  }
  return list;
}
