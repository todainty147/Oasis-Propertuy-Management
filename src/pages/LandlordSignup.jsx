import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { APP_LANGUAGES, getLanguageFlag } from "../i18n/languages";
import { finalizeSelfServeLandlordAccount } from "../services/selfServeSignupService";

export default function LandlordSignup() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [sandboxMode, setSandboxMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function clearLocalAuthState() {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // A failed signup can leave refresh state half-written; clearing local state is best-effort.
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanName = String(accountName || "").trim();
      if (!cleanEmail || !password || !cleanName) {
        throw new Error(t("signup.required"));
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            signup_intent: "landlord_owner",
            signup_account_name: cleanName,
            signup_sandbox_mode: String(sandboxMode),
          },
        },
      });

      let session = signUpData?.session || null;
      const signUpUser = signUpData?.user || null;

      if (signUpErr && !signUpUser) {
        await clearLocalAuthState();
        throw signUpErr;
      }

      if (!session?.user && signUpUser) {
        const recovery = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!recovery.error && recovery.data?.session?.user) {
          session = recovery.data.session;
        } else if (!signUpErr) {
          const sessionResult = await supabase.auth.getSession();
          session = sessionResult.data?.session || null;
        }
      }

      // If auth is instantly signed in (email confirm off), create account immediately.
      if (session?.user) {
        const row = await finalizeSelfServeLandlordAccount(cleanName, { sandboxMode });
        const accountId = row?.account_id;
        if (accountId) localStorage.setItem("activeAccountId", accountId);
        navigate("/dashboard", { replace: true });
        return;
      }

      await clearLocalAuthState();

      // Email confirm on, or confirmation delivery reported a recoverable error:
      // account creation will continue on first successful login.
      if (signUpUser) {
        setMessage(signUpErr ? t("signup.verifyEmailRetry") : t("signup.verifyEmail"));
        setPassword("");
        return;
      }

      if (signUpErr) throw signUpErr;

      setPassword("");
    } catch (e2) {
      await clearLocalAuthState();
      setError(e2?.message || t("signup.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <div className="mb-4 flex items-center rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
          <span className="mr-2 text-sm leading-none text-slate-700" aria-hidden="true">
            {getLanguageFlag(lang, { short: true })}
          </span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="min-w-[4.5rem] bg-transparent text-sm text-slate-800 focus:outline-none"
            aria-label={t("topbar.language")}
          >
            {APP_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {`${language.shortFlag} ${t(language.labelKey)}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-center">
        <form onSubmit={submit} className="w-full max-w-md bg-white p-6 rounded-xl shadow space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-center">{t("signup.title")}</h1>
            <p className="text-sm text-slate-600 text-center">{t("signup.subtitle")}</p>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

          <input
            type="text"
            placeholder={t("signup.accountName")}
            className="w-full border rounded-lg px-3 py-2"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          <input
            type="email"
            placeholder={t("login.email")}
            className="w-full border rounded-lg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder={t("login.password")}
            className="w-full border rounded-lg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label className="flex items-start gap-3 rounded-xl border border-blue-400 bg-blue-950/70 px-3 py-3 text-sm text-blue-50 shadow-sm ring-1 ring-blue-300/20">
            <input
              type="checkbox"
              checked={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-blue-200 bg-slate-950 text-blue-500 accent-blue-500"
            />
            <span>
              <span className="block font-semibold text-white">{t("signup.sandboxMode")}</span>
              <span className="block text-xs leading-5 text-blue-100">{t("signup.sandboxModeHint")}</span>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
          >
            {loading ? t("signup.creating") : t("signup.createLandlord")}
          </button>

          <div className="text-xs text-slate-500">
            {t("signup.inviteOnlyHint")}
          </div>

          <div className="text-sm text-center">
            <Link to="/login" className="text-blue-700 hover:underline">
              {t("signup.haveAccount")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
