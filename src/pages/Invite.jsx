import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { acceptAccountInvite } from "../services/invitationService";

function langFlag(lang) {
  return lang === "pl" ? "PL" : "GB";
}

export default function Invite() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function acceptInvite() {
    if (!token) {
      alert(t("invite.missingToken"));
      return;
    }
    setBusy(true);
    try {
      const result = await acceptAccountInvite(token);
      if (result?.account_id) {
        localStorage.setItem("activeAccountId", result.account_id);
      }
      navigate("/dashboard", { replace: true });
      return;
    } catch (error) {
      alert(error.message);
      setBusy(false);
    }
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <div className="mb-4 flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 shadow-sm">
          <span className="mr-2 text-sm leading-none text-slate-700 dark:text-slate-200" aria-hidden="true">
            {langFlag(lang)}
          </span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="min-w-[4.5rem] bg-transparent text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
            aria-label={t("topbar.language")}
          >
            <option value="pl">{`${langFlag("pl")} ${t("lang.polish")}`}</option>
            <option value="en">{`${langFlag("en")} ${t("lang.english")}`}</option>
          </select>
        </div>
      </div>
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {!user ? t("invite.invited") : t("invite.joinWorkspace")}
            </h1>
            <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
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
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
    </div>
  );
}
