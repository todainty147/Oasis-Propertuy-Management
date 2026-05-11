import { Star } from "lucide-react";
import { useI18n } from "../../context/I18nContext";

export default function FounderBadge({ className = "" }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ${className}`}
    >
      <Star size={10} className="fill-amber-600 text-amber-600 dark:fill-amber-400 dark:text-amber-400" />
      {t("founderOffer.badgeLabel")}
    </span>
  );
}
