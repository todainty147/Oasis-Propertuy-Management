import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { APP_LANGUAGES, getLanguageFlag } from "../i18n/languages";
import { finalizeSelfServeLandlordAccount } from "../services/selfServeSignupService";
import { validatePasswordStrength } from "../utils/passwordPolicy";
import { logSecurityRelevantFailure } from "../services/securityFailureLogger";
import { recordStrongPassword } from "../services/passwordSecurityService";
import { recordAuthRateLimitAttempt, formatRetryAfter } from "../services/authRateLimitService";
import { applyFounderOffer } from "../services/founderOfferService";
import {
  recordActivationEventBestEffort,
  recordSignupIntelligence,
} from "../services/earlyUsersService";
import {
  captureSignupAttribution,
  clearSignupAttribution,
  getSignupAttribution,
} from "../utils/signupAttribution";
import PasswordStrengthMeter from "../components/auth/PasswordStrengthMeter";
import BrandLogo from "../components/BrandLogo";

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
  const [founderNotice, setFounderNotice] = useState("");
  const [feedbackContactOptIn, setFeedbackContactOptIn] = useState(false);
  const [productUpdatesOptIn, setProductUpdatesOptIn] = useState(false);

  const passwordContext = useMemo(
    () => ({ email: email.trim().toLowerCase(), accountName: accountName.trim() }),
    [email, accountName],
  );
  const passwordValidation = useMemo(
    () => validatePasswordStrength(password, passwordContext),
    [password, passwordContext],
  );

  useEffect(() => {
    captureSignupAttribution();
  }, []);

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

      const rateCheck = await recordAuthRateLimitAttempt(cleanEmail, "auth_signup");
      if (!rateCheck.allowed) {
        const time = formatRetryAfter(rateCheck.retryAfterSeconds) || "a while";
        throw new Error(t("signup.rateLimited", { time }));
      }

      const pwResult = validatePasswordStrength(password, { email: cleanEmail, accountName: cleanName });
      if (!pwResult.valid) {
        logSecurityRelevantFailure("auth_weak_password_rejected", {
          error: { message: "Weak password rejected at signup", code: "AUTH_WEAK_PASSWORD" },
          context: { flow: "signup", failedRequirements: pwResult.failedKeys },
        });
        throw new Error(t("passwordPolicy.tooWeak"));
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
        if (accountId) {
          localStorage.setItem("activeAccountId", accountId);
          await recordStrongPassword(accountId);
        }
        if (accountId && session.user) {
          const attribution = getSignupAttribution();
          try {
            await recordSignupIntelligence({
              userId: session.user.id,
              accountId,
              signupType: "landlord_self_serve",
              email: cleanEmail,
              fullName: null,
              signupSource: attribution.signupSource || "app_landlord_signup",
              utmSource: attribution.utmSource || null,
              utmMedium: attribution.utmMedium || null,
              utmCampaign: attribution.utmCampaign || null,
              referrer: attribution.referrer || null,
              landingPath: attribution.landingPath || window.location.pathname,
              locale: lang || navigator.language || null,
              feedbackOptIn: feedbackContactOptIn,
              productUpdatesOptIn,
              marketingConsent: false,
            });
            clearSignupAttribution();
          } catch (captureErr) {
            console.warn("[early-users] signup intelligence capture failed", {
              code: captureErr?.code || "unknown",
            });
          }
        }
        // Apply founder offer on first account creation — non-blocking
        if (row?.created && accountId && session.user) {
          const signupSource = new URLSearchParams(window.location.search).get("source") || "app_landlord_signup";
          const offerResult = await applyFounderOffer({
            accountId,
            userId: session.user.id,
            email: cleanEmail,
            signupSource,
          });
          if (offerResult.qualified) {
            recordActivationEventBestEffort({
              accountId,
              eventKey: "founder_offer_applied",
              metadata: {
                founder_offer_status: offerResult.status || "qualified",
                founder_offer_position: offerResult.position ?? null,
              },
            });
            setFounderNotice(t("founderOffer.applied"));
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
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
          <div className="flex justify-center">
            <BrandLogo variant="header" showSubtitle />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-center">{t("signup.title")}</h1>
            <p className="text-sm text-slate-600 text-center">{t("signup.subtitle")}</p>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {founderNotice ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {founderNotice}
            </p>
          ) : null}

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
          <div>
            <input
              type="password"
              placeholder={t("login.password")}
              className="w-full border rounded-lg px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordStrengthMeter password={password} context={passwordContext} showChecklist />
          </div>

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

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={feedbackContactOptIn}
                onChange={(e) => setFeedbackContactOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600"
              />
              <span>
                <span className="block font-medium text-slate-900">I am happy for the founder team to contact me for product feedback.</span>
                <span className="block text-xs leading-5 text-slate-500">This is optional and you can still create your account without it.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={productUpdatesOptIn}
                onChange={(e) => setProductUpdatesOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600"
              />
              <span>
                <span className="block font-medium text-slate-900">Send me occasional product updates for early users.</span>
                <span className="block text-xs leading-5 text-slate-500">No marketing consent is assumed from these checkboxes.</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || (password.length > 0 && !passwordValidation.valid)}
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
