import { useI18n } from "../../context/I18nContext";
import { useAccount } from "../../context/AccountContext";

export default function AiQuotaExhaustedNotice() {
  const { t } = useI18n();
  const { isFounder } = useAccount();

  const message = isFounder
    ? t("founderOffer.aiExhausted")
    : t("billing.aiQuotaExhaustedGeneric");

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
      {message}
    </div>
  );
}
