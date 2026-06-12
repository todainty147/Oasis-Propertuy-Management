import { useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, Save, UserRound } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { supabase } from "../lib/supabase";
import { assertPhone, normalizeText } from "../utils/validation";
import { usePageTitle } from "../layout/PageTitleContext";
import { validatePasswordStrength } from "../utils/passwordPolicy";
import { logSecurityRelevantFailure } from "../services/securityFailureLogger";
import {
  markLocalStrongPassword,
  recordStrongPassword,
} from "../services/passwordSecurityService";
import PasswordStrengthMeter from "../components/auth/PasswordStrengthMeter";
import { PASSWORD_SECURITY_REFRESH_EVENT } from "../components/security/PasswordUpgradeNotice";

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        {Icon ? <Icon size={16} className="shrink-0 text-slate-400 dark:text-slate-500" /> : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 ${props.className || ""}`}
    />
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { activeAccountId } = useAccount();
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    phone: "",
    job_title: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const metadata = user?.user_metadata || {};
    setProfileForm({
      full_name: normalizeText(metadata.full_name),
      phone: normalizeText(metadata.phone),
      job_title: normalizeText(metadata.job_title),
    });
  }, [user]);

  useEffect(() => {
    setTitle(t("topbar.profile"));
  }, [setTitle, t]);

  const email = useMemo(() => user?.email || "", [user?.email]);

  const passwordPolicyContext = useMemo(
    () => ({ email, name: normalizeText(profileForm.full_name) }),
    [email, profileForm.full_name],
  );
  const passwordValidation = useMemo(
    () => validatePasswordStrength(passwordForm.newPassword, passwordPolicyContext),
    [passwordForm.newPassword, passwordPolicyContext],
  );

  function updateProfileField(key, value) {
    setProfileForm((current) => ({ ...current, [key]: value }));
  }

  function updatePasswordField(key, value) {
    setPasswordForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const payload = {
        full_name: normalizeText(profileForm.full_name),
        phone: assertPhone(profileForm.phone, { required: false }),
        job_title: normalizeText(profileForm.job_title),
      };

      const { error } = await supabase.auth.updateUser({
        data: payload,
      });
      if (error) throw error;

      setProfileMessage(t("profile.saveSuccess"));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("profile.saveError"));
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordMessage("");

    try {
      const newPassword = String(passwordForm.newPassword || "");
      const confirmPassword = String(passwordForm.confirmPassword || "");

      if (!newPassword || !confirmPassword) {
        throw new Error(t("profile.passwordRequired"));
      }
      if (newPassword !== confirmPassword) {
        throw new Error(t("profile.passwordMismatch"));
      }

      const pwResult = validatePasswordStrength(newPassword, passwordPolicyContext);
      if (!pwResult.valid) {
        logSecurityRelevantFailure("auth_weak_password_rejected", {
          error: { message: "Weak password rejected at profile update", code: "AUTH_WEAK_PASSWORD" },
          context: { flow: "update_password", failedRequirements: pwResult.failedKeys },
        });
        throw new Error(t("passwordPolicy.tooWeak"));
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      const recorded = await recordStrongPassword(activeAccountId);
      if (!recorded) {
        throw new Error(t("profile.passwordSecurityUpdateError"));
      }
      markLocalStrongPassword(user?.id);
      window.dispatchEvent(new Event(PASSWORD_SECURITY_REFRESH_EVENT));

      setPasswordForm({ newPassword: "", confirmPassword: "" });
      setPasswordMessage(t("profile.passwordSaveSuccess"));
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t("profile.passwordSaveError"));
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("profile.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {t("profile.subtitle")}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={saveProfile}
          className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <UserRound size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("profile.basicInfo")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("profile.basicInfoHint")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Field label={t("profile.email")} icon={Mail}>
              <TextInput value={email} disabled className="cursor-not-allowed text-slate-500 dark:text-slate-400" />
            </Field>

            <Field label={t("profile.fullName")} icon={UserRound}>
              <TextInput
                value={profileForm.full_name}
                onChange={(e) => updateProfileField("full_name", e.target.value)}
                placeholder={t("profile.fullNamePlaceholder")}
              />
            </Field>

            <Field label={t("profile.phone")}>
              <TextInput
                value={profileForm.phone}
                onChange={(e) => updateProfileField("phone", e.target.value)}
                placeholder={t("profile.phonePlaceholder")}
              />
            </Field>

            <Field label={t("profile.jobTitle")}>
              <TextInput
                value={profileForm.job_title}
                onChange={(e) => updateProfileField("job_title", e.target.value)}
                placeholder={t("profile.jobTitlePlaceholder")}
              />
            </Field>
          </div>

          {profileError ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{profileError}</p>
          ) : null}
          {profileMessage ? (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">{profileMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={profileBusy}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} />
            {profileBusy ? t("profile.saving") : t("profile.save")}
          </button>
        </form>

        <form
          onSubmit={savePassword}
          className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("profile.changePassword")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("profile.passwordHint")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Field label={t("profile.newPassword")}>
                <TextInput
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => updatePasswordField("newPassword", e.target.value)}
                  placeholder={t("profile.newPassword")}
                />
              </Field>
              <PasswordStrengthMeter
                password={passwordForm.newPassword}
                context={passwordPolicyContext}
                showChecklist
              />
            </div>

            <Field label={t("profile.confirmPassword")}>
              <TextInput
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => updatePasswordField("confirmPassword", e.target.value)}
                placeholder={t("profile.confirmPassword")}
              />
            </Field>
          </div>

          {passwordError ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{passwordError}</p>
          ) : null}
          {passwordMessage ? (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">{passwordMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={passwordBusy || (passwordForm.newPassword.length > 0 && !passwordValidation.valid)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <KeyRound size={16} />
            {passwordBusy ? t("profile.passwordSaving") : t("profile.savePassword")}
          </button>
        </form>
      </div>
    </div>
  );
}
