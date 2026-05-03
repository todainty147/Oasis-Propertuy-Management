import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

export default function Breadcrumbs({ items }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("breadcrumbs.ariaLabel")} className="mb-4">
      <ol className="flex items-center gap-2 text-sm text-slate-500">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-400">/</span>}

            {item.to ? (
              <Link
                to={item.to}
                className="text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:underline dark:text-slate-300 dark:hover:text-white"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-slate-900 font-medium">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
