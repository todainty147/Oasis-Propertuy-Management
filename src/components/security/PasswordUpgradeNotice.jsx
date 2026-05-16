import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, ShieldCheck } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { getOwnSecurityProfile } from "../../services/passwordSecurityService";

const DISMISS_KEY = "oasis_pw_upgrade_dismissed_until";
const DISMISS_HOURS = 24;
export const PASSWORD_SECURITY_REFRESH_EVENT = "tenaqo:password-security-refresh";

function isDismissed() {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    // ignore storage errors
  }
}

/**
 * Stage 3 soft enforcement — shown to any authenticated user whose own
 * password_strength_status is not 'strong'. Dismissible for 24 hours.
 * Links to /profile where they can update their password.
 */
export default function PasswordUpgradeNotice({ userId, profilePath = "/settings/profile" }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId || isDismissed()) return;
    let cancelled = false;

    async function refresh() {
      const profile = await getOwnSecurityProfile();
      if (cancelled) return;
      setVisible(Boolean(profile && profile.password_strength_status !== "strong"));
    }

    function refreshWhenFocused() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }

    refresh();
    window.addEventListener(PASSWORD_SECURITY_REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenFocused);

    return () => {
      cancelled = true;
      window.removeEventListener(PASSWORD_SECURITY_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenFocused);
    };
  }, [userId]);

  function handleDismiss() {
    dismiss();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/30">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="min-w-0 flex-1 text-sm text-blue-800 dark:text-blue-300">
        <span className="font-semibold">{t("securityPosture.ownWarningTitle")}: </span>
        {t("securityPosture.ownWarningBody")}{" "}
        <Link
          to={profilePath}
          className="font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-200"
        >
          {t("securityPosture.ownWarningCta")}
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("securityPosture.ownWarningDismiss")}
        className="shrink-0 rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900 dark:hover:text-blue-200"
      >
        <X size={14} />
      </button>
    </div>
  );
}
