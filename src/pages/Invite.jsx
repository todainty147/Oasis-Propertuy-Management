import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { logSecurityRelevantFailure } from "../services/securityFailureLogger";

export default function Invite() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function acceptInvite() {
    if (!token) {
      alert(t("invite.missingToken"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc(
      "accept_account_invite",
      { invite_token: token }
    );

    if (!error) {
      if (data?.account_id) {
        localStorage.setItem("activeAccountId", data.account_id);
      }
      navigate("/dashboard", { replace: true });
      return;
    }
    logSecurityRelevantFailure("accept_account_invite", {
      error,
      context: { inviteFlow: "accept" },
    });
    alert(error.message);
    setBusy(false);
  }

  async function sendMagicLink() {
    if (!token) {
      alert(t("invite.missingToken"));
      return;
    }
    if (!email) return;
    setBusy(true);
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/invite?token=${token}`,
      },
    });
    setBusy(false);
  }

  if (loading) return null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {!user ? t("invite.invited") : t("invite.joinWorkspace")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {token ? t("invite.tokenOk") : t("invite.invalidToken")}
          </p>
        </div>

      {!user ? (
        <>
          <input
            type="email"
            placeholder={t("invite.workEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={busy || !email || !token}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white ${
              busy || !email || !token ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? t("common.sending") : t("invite.continueWithEmail")}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={acceptInvite}
            disabled={busy || !token}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow ${
              busy || !token ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy ? t("common.processing") : t("invite.acceptInvitation")}
          </button>
        </>
      )}
      </div>
    </div>
  );
}
