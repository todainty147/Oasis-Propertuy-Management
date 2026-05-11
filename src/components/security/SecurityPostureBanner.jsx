import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { listAccountPasswordSecurity } from "../../services/passwordSecurityService";

/**
 * Stage 2 admin banner — shown to owners/admins when account members have
 * legacy_weak or unknown password status. Links to /roles for remediation.
 */
export default function SecurityPostureBanner({ accountId }) {
  const { t } = useI18n();
  const [weakCount, setWeakCount] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;

    listAccountPasswordSecurity(accountId).then((rows) => {
      if (cancelled) return;
      const count = rows.filter(
        (r) => r.password_strength_status !== "strong"
      ).length;
      setWeakCount(count);
    });

    return () => { cancelled = true; };
  }, [accountId]);

  if (!weakCount) return null;

  const body = t("securityPosture.bannerBody").replace("{{count}}", weakCount);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/30">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-300">
        <span className="font-semibold">{t("securityPosture.bannerTitle")}: </span>
        {body}{" "}
        <Link
          to="/roles"
          className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
        >
          {t("securityPosture.bannerCta")}
        </Link>
      </div>
    </div>
  );
}
