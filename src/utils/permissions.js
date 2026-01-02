/* ======================
   DOCUMENT PERMISSIONS
   ACCOUNT-BASED (FINAL)
   ====================== */

/**
 * Upload:
 * - owner
 * - admin
 * - staff
 */
export function canUploadDocument(role) {
  return role === "owner" || role === "admin" || role === "staff";
}

/**
 * Edit metadata (tags, rename):
 * - owner
 * - admin
 */
export function canEditDocument({ role }) {
  return role === "owner" || role === "admin";
}

/**
 * Delete document:
 * - owner
 * - admin
 */
export function canDeleteDocument({ role }) {
  return role === "owner" || role === "admin";
}
