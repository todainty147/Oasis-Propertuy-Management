import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { APP_LANGUAGES, getLanguageFlag } from "../i18n/languages";
import { recordAuthRateLimitAttempt, formatRetryAfter } from "../services/authRateLimitService";

export default function Login() {
  const [params] = useSearchParams();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inviteToken = String(params.get("invite_token") || "").trim();
  const forgotPasswordHref = inviteToken
    ? `/reset-password?invite_token=${encodeURIComponent(inviteToken)}`
    : "/reset-password";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const rateCheck = await recordAuthRateLimitAttempt(email, "auth_login");
    if (!rateCheck.allowed) {
      const time = formatRetryAfter(rateCheck.retryAfterSeconds);
      setError(time ? t("login.rateLimited", { time }) : t("login.rateLimitedGeneric"));
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <div className="mb-4 flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 shadow-sm">
          <span className="mr-2 text-sm leading-none text-slate-700 dark:text-slate-200" aria-hidden="true">
            {getLanguageFlag(lang, { short: true })}
          </span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="min-w-[4.5rem] bg-transparent text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
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
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow"
      >
        {/* Logo — always on white so dark-navy logo colours remain legible in dark mode */}
        <div className="flex justify-center mb-6">
          <div className="rounded-xl bg-white px-5 py-3 shadow border border-slate-200">
            <img
              src="/logo.png"
              alt="OASIS Rental"
              className="h-12 w-auto object-contain"
            />
          </div>
        </div>

        <h1 className="text-xl font-bold mb-4 text-center text-slate-900 dark:text-slate-100">
          {t("login.title")}
        </h1>

        {error && (
          <p className="mb-3 text-sm text-red-600">{error}</p>
        )}

        <input
          type="email"
          placeholder={t("login.email")}
          className="w-full mb-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder={t("login.password")}
          className="w-full mb-4 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
        >
          {loading ? t("login.loggingIn") : t("login.login")}
        </button>

        <div className="mt-4 text-sm text-center">
          <Link to={forgotPasswordHref} className="text-slate-600 dark:text-slate-300 hover:underline">
            {t("login.forgotPassword")}
          </Link>
        </div>

        <div className="mt-2 text-sm text-center">
          <Link to="/signup" className="text-blue-700 hover:underline">
            {t("login.createLandlordAccount")}
          </Link>
        </div>
      </form>
      </div>
    </div>
  );
}
