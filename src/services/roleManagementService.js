import { supabase } from "../lib/supabase";
import {
  firstRpcRow,
  parseAccountMemberRoleAssignmentResult,
  parseAccountRoleAssignmentMemberRow,
  parseAccountRoleRow,
  parseRpcRows,
} from "./rpcContracts";

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

export async function listAccountRoles(accountId) {
  const { data, error } = await supabase.rpc("list_account_roles", {
    p_account_id: accountId,
  });
  if (error) throw friendly(error, "Failed to load roles");
  return parseRpcRows(data || [], parseAccountRoleRow, "account role rows");
}

export async function createAccountRole({ accountId, name, permissionKeys } = {}) {
  const { data, error } = await supabase.rpc("create_account_role", {
    p_account_id: accountId,
    p_name: name,
    p_permission_keys: normalizePermissionKeys(permissionKeys),
  });
  if (error) throw friendly(error, "Failed to create role");
  return parseAccountRoleRow(firstRpcRow(data));
}

export async function updateAccountRolePermissions({ accountId, roleId, permissionKeys } = {}) {
  const { data, error } = await supabase.rpc("update_account_role_permissions", {
    p_account_id: accountId,
    p_role_id: roleId,
    p_permission_keys: normalizePermissionKeys(permissionKeys),
  });
  if (error) throw friendly(error, "Failed to update role permissions");
  return parseAccountRoleRow(firstRpcRow(data));
}

export async function assignAccountMemberRoleId({ accountId, targetUserId, roleId = null } = {}) {
  const { data, error } = await supabase.rpc("assign_account_member_role_id", {
    p_account_id: accountId,
    p_target_user_id: targetUserId,
    p_role_id: roleId,
  });
  if (error) throw friendly(error, "Failed to assign role");
  return parseAccountMemberRoleAssignmentResult(firstRpcRow(data));
}

export async function listAccountMembersForRoleAssignment(accountId) {
  const { data, error } = await supabase.rpc("list_account_members_for_role_assignment", {
    p_account_id: accountId,
  });
  if (error) throw friendly(error, "Failed to load account members");
  return parseRpcRows(
    data || [],
    parseAccountRoleAssignmentMemberRow,
    "account role assignment member rows",
  );
}
