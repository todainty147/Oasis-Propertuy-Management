/* ======================
   DOCUMENT PERMISSIONS
   ====================== */

export function canUploadDocument(role) {
  return role === "admin" || role === "owner";
}

export function canEditDocument({ role, userId, doc }) {
  if (!doc) return false;

  if (role === "admin") return true;
  if (role === "owner" && doc.owner_id === userId) return true;

  return false;
}

export function canDeleteDocument({ role, userId, doc }) {
  // same rules as edit for now
  return canEditDocument({ role, userId, doc });
}
