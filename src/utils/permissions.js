/* ============================================================
   ROLE → RESOURCE → ACTION CAPABILITIES (SOURCE OF TRUTH)
   ============================================================ */

export const ROLE_CAPABILITIES = {
  owner: {
    properties: ["read", "create", "update", "delete"],
    tenants: ["read", "create", "update", "delete"],
    documents: ["read", "upload", "tag", "delete"],
    finance: ["read", "create", "delete"],
    users: ["invite", "role"],
  },

  admin: {
    properties: ["read", "create", "update"],
    tenants: ["read", "create", "update"],
    documents: ["read", "upload", "tag"],
    finance: ["read", "create"],
    users: [],
  },

  staff: {
    properties: ["read"],
    tenants: ["read"],
    documents: ["read"], // upload intentionally blocked here
    finance: [],
    users: [],
  },
};

/* ============================================================
   GENERIC PERMISSION CHECK (USE THIS EVERYWHERE GOING FORWARD)
   ============================================================ */

export function can(role, resource, action) {
  if (!role) return false;

  return (
    ROLE_CAPABILITIES[role]?.[resource]?.includes(action) ?? false
  );
}

/* ============================================================
   🔒 LEGACY HELPERS (BACKWARD COMPATIBLE WRAPPERS)
   DO NOT REMOVE — USED IN EXISTING PAGES
   ============================================================ */

/* ---------- DOCUMENTS ---------- */

export function canUploadDocument(role) {
  // staff upload intentionally allowed (current app behavior)
  return can(role, "documents", "upload") || role === "staff";
}

export function canEditDocument({ role }) {
  return can(role, "documents", "tag");
}

export function canDeleteDocument({ role }) {
  return can(role, "documents", "delete");
}

/* ---------- TENANTS ---------- */

export function canCreateTenant(role) {
  return can(role, "tenants", "create");
}

export function canEditTenant(role) {
  return can(role, "tenants", "update");
}

export function canDeleteTenant(role) {
  return can(role, "tenants", "delete");
}
