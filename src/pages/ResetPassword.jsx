import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { requestPasswordResetEmail } from "../services/passwordResetService";
import { acceptAccountInvite } from "../services/invitationService";
import { validatePasswordStrength } from "../utils/passwordPolicy";
import { logSecurityRelevantFailure } from "../services/securityFailureLogger";
import { recordStrongPassword } from "../services/passwordSecurityService";
import PasswordStrengthMeter from "../components/auth/PasswordStrengthMeter";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const inviteToken = String(params.get("invite_token") || "").trim();

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecovery, setIsRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const passwordValidation = useMemo(
    () => validatePasswordStrength(newPassword),
    [newPassword],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateRecoveryState() {
      const url = new URL(window.location.href);
      const search = url.searchParams;
      const hashParams = new URLSearchParams((url.hash || "").replace(/^#/, ""));

      const flow = String(search.get("flow") || hashParams.get("flow") || "").toLowerCase();
      const type = String(
        search.get("type") || hashParams.get("type") || ""
      ).toLowerCase();
      const tokenHash = search.get("token_hash") || hashParams.get("token_hash");
      const code = search.get("code");
      const hasImplicitToken = Boolean(hashParams.get("access_token"));

      if (flow === "recovery" || type === "recovery" || tokenHash || hasImplicitToken) {
        if (!cancelled) setIsRecovery(true);
      }

      // PKCE recovery links can include ?code=...
      if (code) {
        const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (!codeErr && !cancelled) setIsRecovery(true);
      }

      // OTP recovery links can include token_hash + type=recovery
      if (tokenHash && (type === "recovery" || !type)) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (!otpErr && !cancelled) setIsRecovery(true);
      }

      // Fallback: if Supabase already consumed URL tokens and session exists on this page,
      // keep reset form visible when flow marker is present.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user && flow === "recovery" && !cancelled) {
        setIsRecovery(true);
      }
    }

    hydrateRecoveryState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) {
        setIsRecovery(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function requestReset(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const clean = String(email || "").trim().toLowerCase();
      if (!clean) throw new Error(t("reset.requiredEmail"));

      await requestPasswordResetEmail(clean, { inviteToken });
      setMessage(t("reset.emailSent"));
    } catch (e2) {
      setError(e2?.message || t("reset.requestError"));
    } finally {
      setLoading(false);
    }
  }

  async function saveNewPassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (!newPassword || !confirmPassword) throw new Error(t("reset.requiredPassword"));
      if (newPassword !== confirmPassword) throw new Error(t("reset.passwordMismatch"));

      const pwResult = validatePasswordStrength(newPassword);
      if (!pwResult.valid) {
        logSecurityRelevantFailure("auth_weak_password_rejected", {
          error: { message: "Weak password rejected at reset", code: "AUTH_WEAK_PASSWORD" },
          context: { flow: "reset_password", failedRequirements: pwResult.failedKeys },
        });
        throw new Error(t("passwordPolicy.tooWeak"));
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;

      if (inviteToken) {
        const result = await acceptAccountInvite(inviteToken);
        if (result?.account_id) {
          localStorage.setItem("activeAccountId", result.account_id);
          await recordStrongPassword(result.account_id);
        }
        setMessage(t("reset.success"));
        setTimeout(() => navigate("/dashboard", { replace: true }), 800);
        return;
      }

      // For standalone resets, record against the user's current active account
      const activeAccountId = localStorage.getItem("activeAccountId");
      await recordStrongPassword(activeAccountId);

      setMessage(t("reset.success"));
      setTimeout(() => navigate("/login", { replace: true }), 800);
    } catch (e2) {
      setError(e2?.message || t("reset.updateError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={isRecovery ? saveNewPassword : requestReset}
        className="w-full max-w-sm bg-white p-6 rounded-xl shadow space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">
          {isRecovery ? t("reset.setNewTitle") : t("reset.requestTitle")}
        </h1>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        {!isRecovery ? (
          <input
            type="email"
            placeholder={t("login.email")}
            className="w-full border rounded-lg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : (
          <>
            <div>
              <input
                type="password"
                placeholder={t("reset.newPassword")}
                className="w-full border rounded-lg px-3 py-2"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordStrengthMeter password={newPassword} showChecklist />
            </div>
            <input
              type="password"
              placeholder={t("reset.confirmPassword")}
              className="w-full border rounded-lg px-3 py-2"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </>
        )}

        <button
          type="submit"
          disabled={loading || (isRecovery && newPassword.length > 0 && !passwordValidation.valid)}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
        >
          {loading
            ? t("reset.processing")
            : isRecovery
              ? t("reset.savePassword")
              : t("reset.sendLink")}
        </button>

        <div className="text-sm text-center">
          <Link to="/login" className="text-blue-700 hover:underline">
            {t("reset.backToLogin")}
          </Link>
        </div>

        {!isRecovery ? (
          <button
            type="button"
            onClick={() => setIsRecovery(true)}
            className="w-full text-xs text-slate-500 hover:text-slate-700 hover:underline"
          >
            {t("reset.haveLink")}
          </button>
        ) : null}
      </form>
    </div>
  );
}
