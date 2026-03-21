/* ======================
   ROLE CAPABILITIES
   ====================== */

export const ROLE_CAPABILITIES = {
  owner: {
    properties: ["read", "create", "update", "delete"],
    tenants: ["read", "create", "update", "delete"],
    documents: ["read", "upload", "tag", "delete"],
    finance: ["read", "create", "update", "delete"],
    users: ["invite", "role"],
  },

  admin: {
    properties: ["read", "create", "update"],
    tenants: ["read", "create", "update"],
    documents: ["read", "upload", "tag"],
    finance: ["read", "create", "update"], // ✅ read-only delete for admin (if you want owner-only delete)
    users: [],
  },

  staff: {
    properties: ["read"],
    tenants: ["read"],
    documents: ["read"], // (upload handled by legacy helper below, if you still want)
    finance: ["read"], // ✅ STAFF READ-ONLY FINANCE
    users: [],
  },

  // ✅ NEW: tenant portal permissions (RLS will restrict scope)
  tenant: {
    properties: ["read"],     // tenant can view their linked property
    documents: ["read"],      // optional (keep read; upload can be added later)
    finance: [],              // tenant uses the dedicated tenant payments surface
    tenants: [],              // tenant must NOT browse tenant list
    users: [],                // tenant cannot invite/manage users
  },
};

export function normalizeRole(role) {
  return String(role ?? "").toLowerCase();
}

export function isRootLikeRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "root" || normalized === "super-admin" || normalized === "super_admin";
}

export function isManageRole(role, { isRootOperator = false } = {}) {
  if (isRootOperator || isRootLikeRole(role)) return true;
  const normalized = normalizeRole(role);
  return ["owner", "admin", "staff"].includes(normalized);
}

/* ======================
   GENERIC PERMISSION CHECK
   ====================== */

export function can(role, resource, action) {
  const r = isRootLikeRole(role) ? "owner" : normalizeRole(role);
  if (!r) return false;
  return ROLE_CAPABILITIES[r]?.[resource]?.includes(action) ?? false;
}

/* ============================================================
   LEGACY HELPERS (BACKWARD COMPATIBLE)
   Keep these because they are used around the app.
   They now delegate to can() so logic isn't duplicated.
   ============================================================ */

export function canUploadDocument(role) {
  // If you still want staff to upload docs, keep this:
  return can(role, "documents", "upload") || String(role ?? "").toLowerCase() === "staff";
}

export function canEditDocument({ role }) {
  // "tag" is your metadata/edit permission in the matrix
  return can(role, "documents", "tag");
}

export function canDeleteDocument({ role }) {
  return can(role, "documents", "delete");
}

export function canCreateTenant(role) {
  return can(role, "tenants", "create");
}

export function canEditTenant(role) {
  return can(role, "tenants", "update");
}

export function canDeleteTenant(role) {
  return can(role, "tenants", "delete");
}
