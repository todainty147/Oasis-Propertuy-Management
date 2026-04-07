import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import {
  checkAccountInvitationEligibility,
  createAccountInvitation,
  getAllowedInviteRoles,
  listAccountInvitations,
  resendInvitationEmail,
  revokeInvitation,
} from "../services/invitationService";
import { rootDeleteAccount, rootListAccounts, rootSetAccountDisabled } from "../services/rootAccountService";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function InvitationStatus({ row, t }) {
  if (row?.accepted_at) {
    return <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{t("invites.status.accepted")}</span>;
  }
  if (row?.revoked_at) {
    return <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{t("invites.status.revoked")}</span>;
  }
  return <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">{t("invites.status.pending")}</span>;
}

function roleLabel(role, t) {
  const key = String(role || "").toLowerCase();
  if (key === "owner") return t("invites.roles.landlord");
  if (key === "admin") return t("invites.roles.admin");
  if (key === "staff") return t("invites.roles.manager");
  if (key === "tenant") return t("invites.roles.tenant");
  if (key === "contractor") return t("invites.roles.contractor");
  return role || "—";
}

export default function InvitationsPage() {
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole, activeAccount, accounts, isRootOperator } = useAccount();
  const isRootAccount = Boolean(activeAccount?.is_root);
  const rootAccountId = useMemo(() => accounts.find((a) => a.is_root)?.id || null, [accounts]);

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role), [role]);
  const canManageInvitations = canManage || isRootOperator;
  const allowedInviteRoles = useMemo(() => getAllowedInviteRoles(role, isRootAccount), [role, isRootAccount]);

  const [loading, setLoading] = useState(false);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootSavingId, setRootSavingId] = useState("");
  const [rootDeletingId, setRootDeletingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);

  const [email, setEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [inviteRole, setInviteRole] = useState("tenant");
  const [emailValidation, setEmailValidation] = useState({ checking: false, ok: false, message: "" });

  useEffect(() => {
    if (!allowedInviteRoles.length) return;
    if (!allowedInviteRoles.includes(inviteRole)) {
      setInviteRole(allowedInviteRoles[0]);
    }
  }, [allowedInviteRoles, inviteRole]);

  useEffect(() => {
    setTitle(t("invites.title"));
  }, [setTitle, t]);

  useEffect(() => {
    let cancelled = false;
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!activeAccountId || !cleanEmail || !inviteRole) {
      setEmailValidation({ checking: false, ok: false, message: "" });
      return undefined;
    }

    const timer = setTimeout(async () => {
      setEmailValidation({ checking: true, ok: false, message: t("invites.validating") });
      try {
        const res = await checkAccountInvitationEligibility({
          accountId: activeAccountId,
          email: cleanEmail,
          role: inviteRole,
        });
        if (cancelled) return;
        setEmailValidation({
          checking: false,
          ok: Boolean(res?.ok),
          message: res?.ok ? t("invites.eligible") : (res?.message || t("invites.notEligible")),
        });
      } catch (e) {
        if (cancelled) return;
        setEmailValidation({
          checking: false,
          ok: false,
          message: e?.message || t("invites.validationError"),
        });
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeAccountId, email, inviteRole, t]);

  async function loadInvites() {
    if (!activeAccountId || !canManageInvitations) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listAccountInvitations(activeAccountId);
      setRows(data);
    } catch (e) {
      alert(e?.message || t("invites.loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadRootAccounts() {
    if (!isRootOperator || !rootAccountId) return;
    setRootLoading(true);
    try {
      const rows = await rootListAccounts(rootAccountId);
      setAllAccounts(rows ?? []);
    } catch (e) {
      alert(e?.message || t("invites.rootLoadError"));
      setAllAccounts([]);
    } finally {
      setRootLoading(false);
    }
  }

  useEffect(() => {
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, canManageInvitations]);

  useEffect(() => {
    loadRootAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRootOperator, rootAccountId]);

  async function onInvite(e) {
    e.preventDefault();
    if (!activeAccountId) return;
    if (emailValidation.checking) return;
    if (emailValidation.message && !emailValidation.ok) {
      alert(emailValidation.message);
      return;
    }
    setSaving(true);
    try {
      const created = await createAccountInvitation({
        accountId: activeAccountId,
        email,
        accountName,
        role: inviteRole,
        inviterRole: role,
        isRootAccount,
      });
      setEmail("");
      setAccountName("");
      setInviteRole(allowedInviteRoles.includes("tenant") ? "tenant" : allowedInviteRoles[0] || "staff");
      await loadInvites();
      if (inviteRole === "owner" && created?.account_id) {
        alert(
          `${t("invites.sent")} ${t("invites.createdAccount")}: ${created.account_name || "—"} (${String(created.account_id).slice(0, 8)}…)`
        );
      } else {
        alert(t("invites.sent"));
      }
    } catch (err) {
      alert(err?.message || t("invites.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function onResend(row) {
    try {
      await resendInvitationEmail(row);
      alert(t("invites.resent"));
    } catch (e) {
      alert(e?.message || t("invites.resendError"));
    }
  }

  async function onRevoke(row) {
    const ok = window.confirm(t("invites.revokeConfirm"));
    if (!ok) return;

    try {
      await revokeInvitation({ invitationId: row.id, accountId: activeAccountId });
      await loadInvites();
    } catch (e) {
      alert(e?.message || t("invites.revokeError"));
    }
  }

  async function onToggleAccount(row) {
    if (!isRootOperator || !rootAccountId || !row?.id || row?.is_root) return;
    const nextDisabled = !Boolean(row.is_disabled);
    const ok = window.confirm(
      nextDisabled ? t("invites.disableConfirm") : t("invites.enableConfirm")
    );
    if (!ok) return;

    setRootSavingId(row.id);
    try {
      await rootSetAccountDisabled({
        rootAccountId,
        targetAccountId: row.id,
        disabled: nextDisabled,
      });
      await loadRootAccounts();
    } catch (e) {
      alert(e?.message || t("invites.rootSaveError"));
    } finally {
      setRootSavingId("");
    }
  }

  async function onDeleteAccount(row) {
    if (!isRootOperator || !rootAccountId || !row?.id || row?.is_root) return;
    const ok = window.confirm(t("invites.deleteConfirm"));
    if (!ok) return;

    setRootDeletingId(row.id);
    try {
      await rootDeleteAccount({
        rootAccountId,
        targetAccountId: row.id,
      });
      await loadRootAccounts();
      if (activeAccountId === row.id) {
        localStorage.removeItem("activeAccountId");
        window.location.reload();
      }
    } catch (e) {
      alert(e?.message || t("invites.rootDeleteError"));
    } finally {
      setRootDeletingId("");
    }
  }

  if (!canManageInvitations) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("invites.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <OnboardingHintCard
        title={t("onboarding.hints.invites.title")}
        body={t("onboarding.hints.invites.body")}
      />

      {canManageInvitations ? (
        <>
          <Card className="p-5 border">
            <h2 className="text-base font-semibold text-slate-900">{t("invites.title")}</h2>
            <p className="text-sm text-slate-500 mt-1">{t("invites.subtitle")}</p>

            <form className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3" onSubmit={onInvite}>
              <label className={inviteRole === "owner" ? "md:col-span-2" : "md:col-span-3"}>
                <span className="text-xs text-slate-500">{t("invites.email")}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                />
                {emailValidation.message ? (
                  <p className={`mt-1 text-xs ${emailValidation.ok ? "text-emerald-700" : "text-rose-700"}`}>
                    {emailValidation.message}
                  </p>
                ) : null}
              </label>

              {inviteRole === "owner" ? (
                <label className="md:col-span-2">
                  <span className="text-xs text-slate-500">{t("invites.accountName")}</span>
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder={t("invites.accountNamePlaceholder")}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              ) : null}

              <label>
                <span className="text-xs text-slate-500">{t("invites.role")}</span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {allowedInviteRoles.includes("owner") ? <option value="owner">{t("invites.roles.landlord")}</option> : null}
                  {allowedInviteRoles.includes("admin") ? <option value="admin">{t("invites.roles.admin")}</option> : null}
                  {allowedInviteRoles.includes("staff") ? <option value="staff">{t("invites.roles.manager")}</option> : null}
                  {allowedInviteRoles.includes("tenant") ? <option value="tenant">{t("invites.roles.tenant")}</option> : null}
                  {allowedInviteRoles.includes("contractor") ? <option value="contractor">{t("invites.roles.contractor")}</option> : null}
                </select>
              </label>

              <div className="flex items-end md:col-span-1">
                <button
                  type="submit"
                  disabled={saving || allowedInviteRoles.length === 0}
                  className={`w-full px-3 py-2 text-sm rounded-lg text-white ${saving || allowedInviteRoles.length === 0 ? "bg-slate-400" : "bg-blue-600"}`}
                >
                  {saving ? t("common.sending") : t("invites.send")}
                </button>
              </div>
            </form>
          </Card>

          <Card className="p-5 border">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">{t("invites.pending")}</h3>
              <button
                type="button"
                onClick={loadInvites}
                className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
                disabled={loading}
              >
                {t("common.refresh")}
              </button>
            </div>

            {loading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-slate-500 mt-3">{t("invites.empty")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {rows.map((row) => {
                  const pending = !row.accepted_at && !row.revoked_at;
                  const inviteLink = `${window.location.origin}/invite?token=${row.token}`;
                  return (
                    <div key={row.id || row.token} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{row.email}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {t("invites.role")}: {roleLabel(row.role, t)} • {t("common.createdAt")}: {fmt(row.created_at)}
                          </p>
                        </div>
                        <InvitationStatus row={row} t={t} />
                      </div>

                      {pending ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onResend(row)}
                            className="px-2.5 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
                          >
                            {t("invites.resend")}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(inviteLink)}
                            className="px-2.5 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-50"
                          >
                            {t("invites.copyLink")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRevoke(row)}
                            className="px-2.5 py-1.5 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            {t("invites.revoke")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : null}

      {isRootOperator ? (
        <Card className="p-5 border">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">{t("invites.rootAccounts")}</h3>
            <button
              type="button"
              onClick={loadRootAccounts}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
              disabled={rootLoading}
            >
              {t("common.refresh")}
            </button>
          </div>
          {rootLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {allAccounts.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{row.name || "—"}</p>
                    <p className="text-xs text-slate-500">
                      ID: {String(row.id || "").slice(0, 8)}… • {row.is_root ? t("invites.rootTag") : row.is_disabled ? t("invites.disabledTag") : t("invites.activeTag")}
                    </p>
                  </div>
                  {!row.is_root ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleAccount(row)}
                        disabled={rootSavingId === row.id || rootDeletingId === row.id}
                        className={`px-2.5 py-1.5 text-xs rounded border ${
                          row.is_disabled
                            ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            : "border-rose-300 text-rose-700 hover:bg-rose-50"
                        }`}
                      >
                        {rootSavingId === row.id
                          ? t("common.processing")
                          : row.is_disabled
                            ? t("invites.enableAccount")
                            : t("invites.disableAccount")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAccount(row)}
                        disabled={rootDeletingId === row.id || rootSavingId === row.id}
                        className="px-2.5 py-1.5 text-xs rounded border border-red-400 text-red-700 hover:bg-red-50"
                      >
                        {rootDeletingId === row.id ? t("common.processing") : t("invites.deleteAccount")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
