import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import Card from "../components/Card";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { isManageRole } from "../utils/permissions";
import {
  assignAccountMemberRoleId,
  createAccountRole,
  listAccountMembersForRoleAssignment,
  listAccountRoles,
  ROLE_PERMISSION_OPTIONS,
  updateAccountRolePermissions,
} from "../services/roleManagementService";
import { listAccountPasswordSecurity } from "../services/passwordSecurityService";

const STATUS_I18N = {
  strong:         "securityPosture.statusStrong",
  legacy_weak:    "securityPosture.statusLegacy",
  unknown:        "securityPosture.statusUnknown",
  reset_required: "securityPosture.statusRequired",
};

function formatPermissionLabel(permissionKey) {
  return String(permissionKey || "")
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function PermissionChecklist({ selectedKeys, onToggle, disabled = false }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {ROLE_PERMISSION_OPTIONS.map((permissionKey) => {
        const checked = selectedKeys.includes(permissionKey);
        return (
          <label
            key={permissionKey}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
              disabled
                ? "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500"
                : "border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-200"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(permissionKey)}
            />
            <span>{formatPermissionLabel(permissionKey)}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function RolesManagementPage() {
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole, isRootOperator } = useAccount();
  const canManageRoles = isRootOperator || isManageRole(activeRole);

  const [searchParams] = useSearchParams();
  const highlightSecurity = searchParams.get("highlight") === "security";

  const [loading, setLoading] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState("");
  const [assigningUserId, setAssigningUserId] = useState("");
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [securityMap, setSecurityMap] = useState({});

  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [editingPermissionsByRoleId, setEditingPermissionsByRoleId] = useState({});

  useEffect(() => {
    setTitle(t("roles.title"));
  }, [setTitle, t]);

  async function loadPage() {
    if (!activeAccountId || !canManageRoles) return;
    setLoading(true);
    try {
      const requests = [
        listAccountRoles(activeAccountId),
        listAccountMembersForRoleAssignment(activeAccountId),
      ];
      if (highlightSecurity) {
        requests.push(listAccountPasswordSecurity(activeAccountId));
      }
      const [roleRows, memberRows, securityRows] = await Promise.all(requests);
      setRoles(roleRows);
      setMembers(memberRows);
      setEditingPermissionsByRoleId(
        Object.fromEntries(roleRows.map((role) => [role.id, role.permissionKeys])),
      );
      if (securityRows) {
        const map = {};
        for (const row of securityRows) {
          map[row.user_id] = row.password_strength_status;
        }
        setSecurityMap(map);
      }
    } catch (error) {
      window.alert(error?.message || t("roles.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, canManageRoles, highlightSecurity]);

  const customRoles = useMemo(
    () => roles.filter((role) => !role.isSystem),
    [roles],
  );

  function toggleNewRolePermission(permissionKey) {
    setNewRolePermissions((current) =>
      current.includes(permissionKey)
        ? current.filter((entry) => entry !== permissionKey)
        : [...current, permissionKey],
    );
  }

  function toggleExistingRolePermission(roleId, permissionKey) {
    setEditingPermissionsByRoleId((current) => {
      const rolePermissions = current[roleId] || [];
      return {
        ...current,
        [roleId]: rolePermissions.includes(permissionKey)
          ? rolePermissions.filter((entry) => entry !== permissionKey)
          : [...rolePermissions, permissionKey],
      };
    });
  }

  async function handleCreateRole(event) {
    event.preventDefault();
    if (!activeAccountId) return;
    setSavingRoleId("new");
    try {
      await createAccountRole({
        accountId: activeAccountId,
        name: newRoleName,
        permissionKeys: newRolePermissions,
      });
      setNewRoleName("");
      setNewRolePermissions([]);
      await loadPage();
    } catch (error) {
      window.alert(error?.message || t("roles.createError"));
    } finally {
      setSavingRoleId("");
    }
  }

  async function handleSavePermissions(roleId) {
    if (!activeAccountId) return;
    setSavingRoleId(roleId);
    try {
      await updateAccountRolePermissions({
        accountId: activeAccountId,
        roleId,
        permissionKeys: editingPermissionsByRoleId[roleId] || [],
      });
      await loadPage();
    } catch (error) {
      window.alert(error?.message || t("roles.updateError"));
    } finally {
      setSavingRoleId("");
    }
  }

  async function handleAssignRole(userId, roleId) {
    if (!activeAccountId) return;
    setAssigningUserId(userId);
    try {
      await assignAccountMemberRoleId({
        accountId: activeAccountId,
        targetUserId: userId,
        roleId: roleId || null,
      });
      await loadPage();
    } catch (error) {
      window.alert(error?.message || t("roles.assignError"));
    } finally {
      setAssigningUserId("");
    }
  }

  if (!canManageRoles) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("roles.title")}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {t("roles.subtitle")}
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("roles.createTitle")}</h2>
        <form className="mt-4 space-y-4" onSubmit={handleCreateRole}>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="role-name">
              {t("roles.roleName")}
            </label>
            <input
              id="role-name"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={newRoleName}
              onChange={(event) => setNewRoleName(event.target.value)}
              placeholder={t("roles.roleNamePlaceholder")}
            />
          </div>
          <PermissionChecklist
            selectedKeys={newRolePermissions}
            onToggle={toggleNewRolePermission}
            disabled={savingRoleId === "new"}
          />
          <button
            type="submit"
            disabled={savingRoleId === "new" || !newRoleName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
          >
            {savingRoleId === "new" ? t("roles.creating") : t("roles.create")}
          </button>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("roles.customTitle")}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {t("roles.customSubtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={loadPage}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            >
              {t("common.refresh")}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {loading ? <p className="text-sm text-slate-500">{t("roles.loading")}</p> : null}
            {!loading && customRoles.length === 0 ? (
              <p className="text-sm text-slate-500">{t("roles.empty")}</p>
            ) : null}
            {customRoles.map((role) => (
              <div key={role.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-slate-900 dark:text-slate-100">{role.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("roles.assignedMembers", { count: role.memberCount })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingRoleId === role.id}
                    onClick={() => handleSavePermissions(role.id)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {savingRoleId === role.id ? t("common.saving") : t("common.save")}
                  </button>
                </div>
                <div className="mt-4">
                  <PermissionChecklist
                    selectedKeys={editingPermissionsByRoleId[role.id] || []}
                    onToggle={(permissionKey) => toggleExistingRolePermission(role.id, permissionKey)}
                    disabled={savingRoleId === role.id}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("roles.assignTitle")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t("roles.assignSubtitle")}
          </p>

          {highlightSecurity && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-950/30">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-800 dark:text-amber-300">{t("securityPosture.highlightNote")}</p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-slate-500">{t("roles.loadingMembers")}</p> : null}
            {!loading && members.length === 0 ? (
              <p className="text-sm text-slate-500">{t("roles.noMembers")}</p>
            ) : null}
            {members.map((member) => {
              const pwStatus = securityMap[member.userId];
              const isWeak = pwStatus && pwStatus !== "strong";
              return (
                <div
                  key={member.userId}
                  className={`flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between ${
                    isWeak && highlightSecurity
                      ? "border-amber-300 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-950/10"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {member.email || member.userId}
                      </p>
                      {isWeak && highlightSecurity && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          <ShieldAlert size={9} />
                          {t(STATUS_I18N[pwStatus] ?? "securityPosture.statusUnknown")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("roles.legacyRole", { role: member.legacyRole })}
                      {member.roleName
                        ? ` • ${t("roles.customRole", { role: member.roleName })}`
                        : ` • ${t("roles.customRoleNone")}`}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={member.roleId || ""}
                      disabled={assigningUserId === member.userId}
                      onChange={(event) => handleAssignRole(member.userId, event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">{t("roles.systemRoleOnly")}</option>
                      {customRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    {assigningUserId === member.userId ? (
                      <span className="text-xs text-slate-500">{t("common.saving")}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
