import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import {
  createAccountInvitation,
  getAllowedInviteRoles,
  listAccountInvitations,
  resendInvitationEmail,
  revokeInvitation,
} from "../services/invitationService";

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
  const { activeAccountId, activeRole } = useAccount();

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);
  const allowedInviteRoles = useMemo(() => getAllowedInviteRoles(role), [role]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("tenant");

  useEffect(() => {
    if (!allowedInviteRoles.length) return;
    if (!allowedInviteRoles.includes(inviteRole)) {
      setInviteRole(allowedInviteRoles[0]);
    }
  }, [allowedInviteRoles, inviteRole]);

  useEffect(() => {
    setTitle(t("invites.title"));
  }, [setTitle, t]);

  async function loadInvites() {
    if (!activeAccountId || !canManage) return;
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

  useEffect(() => {
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, canManage]);

  async function onInvite(e) {
    e.preventDefault();
    if (!activeAccountId) return;
    setSaving(true);
    try {
      await createAccountInvitation({
        accountId: activeAccountId,
        email,
        role: inviteRole,
        inviterRole: role,
      });
      setEmail("");
      setInviteRole(allowedInviteRoles.includes("tenant") ? "tenant" : allowedInviteRoles[0] || "staff");
      await loadInvites();
      alert(t("invites.sent"));
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

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("invites.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 border">
        <h2 className="text-base font-semibold text-slate-900">{t("invites.title")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("invites.subtitle")}</p>

        <form className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={onInvite}>
          <label className="md:col-span-2">
            <span className="text-xs text-slate-500">{t("invites.email")}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            />
          </label>

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

          <div className="flex items-end">
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
    </div>
  );
}
