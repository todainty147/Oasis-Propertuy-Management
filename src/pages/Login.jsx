import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { APP_LANGUAGES, getLanguageFlag } from "../i18n/languages";
import { recordAuthRateLimitAttempt, formatRetryAfter } from "../services/authRateLimitService";
import { BRAND } from "../config/brand";
import BrandLogo from "../components/BrandLogo";
import { ActionPill, TenaqoCard } from "../components/ui/TenaqoPrimitives";

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
    <div className="tenaqo-app-surface flex min-h-screen flex-col p-4">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <div className="mb-4 flex items-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-1)] px-2.5 py-1.5 shadow-[var(--shadow-subtle)]">
          <span className="mr-2 text-sm leading-none text-[var(--text-secondary)]" aria-hidden="true">
            {getLanguageFlag(lang, { short: true })}
          </span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="min-w-[4.5rem] bg-transparent text-sm text-[var(--text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-border)]"
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
      <div className="flex flex-1 items-center justify-center">
      <TenaqoCard
        as="form"
        onSubmit={submit}
        variant="elevated"
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex justify-center">
          <BrandLogo variant="header" showSubtitle />
        </div>

        <h1 className="mb-4 text-center text-xl font-bold text-[var(--text-primary)]">
          {t("login.title")}
        </h1>
        <p className="mb-4 text-center text-xs text-[var(--text-muted)]">
          {BRAND.transitionLabel}
        </p>

        {error && (
          <p className="mb-3 rounded-xl bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-text)]">{error}</p>
        )}

        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder={t("login.email")}
          className="mb-3 w-full rounded-[var(--radius-control)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-border)] focus:outline-none focus:ring-2 focus:ring-[rgba(20,139,166,0.18)]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder={t("login.password")}
          className="mb-4 w-full rounded-[var(--radius-control)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-border)] focus:outline-none focus:ring-2 focus:ring-[rgba(20,139,166,0.18)]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[var(--radius-control)] bg-[var(--focus-border)] py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-border)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        >
          {loading ? t("login.loggingIn") : t("login.login")}
        </button>

        <div className="mt-4 text-sm text-center">
          <Link to={forgotPasswordHref} className="text-[var(--text-secondary)] hover:underline">
            {t("login.forgotPassword")}
          </Link>
        </div>

        <div className="mt-3 flex justify-center text-sm">
          <ActionPill as={Link} to="/signup">
            {t("login.createLandlordAccount")}
          </ActionPill>
        </div>
      </TenaqoCard>
      </div>
    </div>
  );
}
