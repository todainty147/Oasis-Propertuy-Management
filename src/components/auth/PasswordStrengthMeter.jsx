// src/components/auth/PasswordStrengthMeter.jsx
//
// Reusable password-strength indicator for all OASIS password creation /
// change flows. Accepts the raw password and an optional context object
// (email, name, accountName) to enable personal-info checks.

import { useI18n } from "../../context/I18nContext";
import { validatePasswordStrength } from "../../utils/passwordPolicy";

const BAR_COLORS = [
  "",                    // 0 – empty, no bar rendered
  "bg-red-500",          // 1 – Weak
  "bg-amber-500",        // 2 – Fair
  "bg-yellow-400",       // 3 – Good
  "bg-emerald-500",      // 4 – Strong
];

const LABEL_COLORS = [
  "text-slate-400 dark:text-slate-500",
  "text-red-600 dark:text-red-400",
  "text-amber-600 dark:text-amber-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-emerald-600 dark:text-emerald-400",
];

/**
 * @param {object} props
 * @param {string}  props.password      – current password value
 * @param {object}  [props.context]     – { email?, name?, accountName? }
 * @param {boolean} [props.showChecklist=true] – whether to render the requirement checklist
 */
export default function PasswordStrengthMeter({ password, context = {}, showChecklist = true }) {
  const { t } = useI18n();

  if (!password) return null;

  const result = validatePasswordStrength(password, context);
  const { score, labelKey, label, requirements } = result;

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar + label */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4}>
          {[1, 2, 3, 4].map((tier) => (
            <div
              key={tier}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                score >= tier
                  ? BAR_COLORS[score]
                  : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
        <span className={`w-14 shrink-0 text-right text-xs font-medium ${LABEL_COLORS[score]}`}>
          {score > 0 ? t(labelKey, label) : ""}
        </span>
      </div>

      {/* Requirements checklist */}
      {showChecklist && (
        <ul className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          {requirements.map((req) => (
            <li
              key={req.key}
              className={`flex items-start gap-2 text-xs leading-relaxed ${
                req.met
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 text-[10px] font-bold ${
                  req.met ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"
                }`}
                aria-hidden="true"
              >
                {req.met ? "✓" : "○"}
              </span>
              {t(req.i18nKey, req.label)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
