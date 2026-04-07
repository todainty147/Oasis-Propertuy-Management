import { supabase } from "../lib/supabase";

function friendly(error, fallback) {
  return new Error(error?.message ?? fallback);
}

function normalizePermissionKeys(permissionKeys = []) {
  return Array.from(
    new Set(
      (Array.isArray(permissionKeys) ? permissionKeys : [])
        .map((key) => String(key ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export const ROLE_PERMISSION_OPTIONS = [
  "properties.read",
  "properties.create",
  "properties.update",
  "properties.delete",
  "tenants.read",
  "tenants.create",
  "tenants.update",
  "tenants.delete",
  "documents.read",
  "documents.upload",
  "documents.tag",
  "documents.delete",
  "finance.read",
  "finance.create",
  "finance.update",
  "finance.delete",
  "users.invite",
  "users.role",
];

function normalizeRoleRow(row) {
  return {
    id: String(row?.role_id || row?.id || ""),
    name: String(row?.name || ""),
    permissionKeys: normalizePermissionKeys(row?.permission_keys),
    memberCount: Number(row?.member_count || 0),
    isSystem: Boolean(row?.is_system),
  };
}

function normalizeMemberRow(row) {
  return {
    userId: String(row?.user_id || ""),
    email: String(row?.email || ""),
    legacyRole: String(row?.legacy_role || ""),
    roleId: row?.role_id ? String(row.role_id) : null,
    roleName: row?.role_name ? String(row.role_name) : null,
  };
}

export async function listAccountRoles(accountId) {
  const { data, error } = await supabase.rpc("list_account_roles", {
    p_account_id: accountId,
  });
  if (error) throw friendly(error, "Failed to load roles");
  return (data || []).map(normalizeRoleRow);
}

export async function createAccountRole({ accountId, name, permissionKeys } = {}) {
  const { data, error } = await supabase.rpc("create_account_role", {
    p_account_id: accountId,
    p_name: name,
    p_permission_keys: normalizePermissionKeys(permissionKeys),
  });
  if (error) throw friendly(error, "Failed to create role");
  return normalizeRoleRow(Array.isArray(data) ? data[0] : data);
}

export async function updateAccountRolePermissions({ accountId, roleId, permissionKeys } = {}) {
  const { data, error } = await supabase.rpc("update_account_role_permissions", {
    p_account_id: accountId,
    p_role_id: roleId,
    p_permission_keys: normalizePermissionKeys(permissionKeys),
  });
  if (error) throw friendly(error, "Failed to update role permissions");
  return normalizeRoleRow(Array.isArray(data) ? data[0] : data);
}

export async function assignAccountMemberRoleId({ accountId, targetUserId, roleId = null } = {}) {
  const { data, error } = await supabase.rpc("assign_account_member_role_id", {
    p_account_id: accountId,
    p_target_user_id: targetUserId,
    p_role_id: roleId,
  });
  if (error) throw friendly(error, "Failed to assign role");
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function listAccountMembersForRoleAssignment(accountId) {
  const { data, error } = await supabase.rpc("list_account_members_for_role_assignment", {
    p_account_id: accountId,
  });
  if (error) throw friendly(error, "Failed to load account members");
  return (data || []).map(normalizeMemberRow);
}
