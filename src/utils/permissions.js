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
    documents: ["read", "tag"], // staff can update document tags, but not upload/delete
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

export const LEGACY_PERMISSION_KEYS_BY_ROLE = {
  owner: [
    "properties.read", "properties.create", "properties.update", "properties.delete",
    "tenants.read", "tenants.create", "tenants.update", "tenants.delete",
    "documents.read", "documents.upload", "documents.tag", "documents.delete",
    "finance.read", "finance.create", "finance.update", "finance.delete",
    "users.invite", "users.role",
  ],
  admin: [
    "properties.read", "properties.create", "properties.update",
    "tenants.read", "tenants.create", "tenants.update",
    "documents.read", "documents.upload", "documents.tag",
    "finance.read", "finance.create", "finance.update",
  ],
  staff: [
    "properties.read",
    "tenants.read",
    "documents.read", "documents.upload", "documents.tag",
    "finance.read",
  ],
  tenant: [
    "properties.read",
    "documents.read",
  ],
  contractor: [],
};

export function normalizeRole(role) {
  return String(role ?? "").toLowerCase();
}

function normalizePermissionKeys(permissionKeys) {
  if (!Array.isArray(permissionKeys)) return null;
  return Array.from(
    new Set(
      permissionKeys
        .map((key) => String(key ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function getPermissionKeysForRole(role) {
  const normalized = isRootLikeRole(role) ? "owner" : normalizeRole(role);
  return [...(LEGACY_PERMISSION_KEYS_BY_ROLE[normalized] ?? [])];
}

export function buildPermissionContext(role, permissionKeys = null) {
  const resolvedKeys = normalizePermissionKeys(permissionKeys) ?? getPermissionKeysForRole(role);
  return {
    role: normalizeRole(role),
    permissionKeys: resolvedKeys,
  };
}

function resolvePermissionContext(subject) {
  if (typeof subject === "object" && subject !== null) {
    return buildPermissionContext(subject.role, subject.permissionKeys ?? null);
  }
  return buildPermissionContext(subject, null);
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
  const { role: resolvedRole, permissionKeys } = resolvePermissionContext(role);
  const r = isRootLikeRole(resolvedRole) ? "owner" : normalizeRole(resolvedRole);
  if (!r) return false;
  const permissionKey = `${resource}.${action}`.toLowerCase();
  if (permissionKeys.includes(permissionKey)) return true;
  return ROLE_CAPABILITIES[r]?.[resource]?.includes(action) ?? false;
}

/* ============================================================
   LEGACY HELPERS (BACKWARD COMPATIBLE)
   Keep these because they are used around the app.
   They now delegate to can() so logic isn't duplicated.
   ============================================================ */

export function canUploadDocument(role) {
  const roleValue = typeof role === "object" && role !== null ? role.role : role;
  return can(role, "documents", "upload") || normalizeRole(roleValue) === "staff";
}

export function canEditDocumentTags(role) {
  return can(role, "documents", "tag");
}

export function canEditDocument(roleOrContext) {
  const role = typeof roleOrContext === "object" && roleOrContext !== null ? roleOrContext.role : roleOrContext;
  return canEditDocumentTags(role);
}

export function canDeleteDocument(role) {
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
