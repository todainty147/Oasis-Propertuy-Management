import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BriefcaseBusiness, CreditCard, Home, LayoutDashboard, UserPlus, Wrench } from "lucide-react";
import Card from "../components/Card";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import { useAccount } from "../context/AccountContext";

const STEP_META = [
  { key: "step1", icon: Home, ctaPath: "/properties", ctaKey: "cta.addProperty" },
  { key: "step2", icon: UserPlus, ctaPath: "/invitations", ctaKey: "cta.inviteTenant" },
  { key: "step3", icon: CreditCard, ctaPath: "/finance", ctaKey: "cta.openFinance" },
  { key: "step4", icon: Wrench, ctaPath: "/maintenance-inbox", ctaKey: "cta.openInbox" },
  { key: "step5", icon: BriefcaseBusiness, ctaPath: "/invitations", ctaKey: "cta.inviteContractor" },
];

export default function LandlordOnboardingPage() {
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const { activeRole } = useAccount();

  const role = String(activeRole ?? "").toLowerCase();
  const isOwner = role === "owner";

  useEffect(() => {
    setTitle(t("onboarding.pageTitle"));
  }, [setTitle, t]);

  if (!isOwner) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-600">{t("onboarding.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-8 pt-3 lg:pt-4">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6 shadow-lg dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_36%)]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">{t("onboarding.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{t("onboarding.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{t("onboarding.subtitle")}</p>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("onboarding.dashboardCardTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("onboarding.dashboardCardBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("onboarding.invitesCardTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("onboarding.invitesCardBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("onboarding.maintenanceCardTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("onboarding.maintenanceCardBody")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {STEP_META.map(({ key, icon: Icon, ctaPath, ctaKey }, idx) => (
          <Card
            key={key}
            className={`group relative overflow-hidden border border-slate-200 bg-gradient-to-br from-white via-white to-sky-50/70 p-5 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/70 dark:hover:border-blue-500 ${
              idx === STEP_META.length - 1 ? "lg:col-span-2" : ""
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 opacity-80" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-300">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                    {t("onboarding.stepLabel", { number: idx + 1 })}
                  </p>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t(`onboarding.${key}.title`)}</h3>
                </div>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">{t(`onboarding.${key}.body`)}</p>

            <div className="mt-4">
              <Link
                to={ctaPath}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-white dark:text-slate-900 dark:hover:bg-blue-100"
              >
                {t(`onboarding.${ctaKey}`)}
                <ArrowRight size={16} />
              </Link>
            </div>
          </Card>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-sky-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/80">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 opacity-80" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/12 dark:text-blue-300">
              <LayoutDashboard size={18} />
            </div>
            <div className="max-w-3xl">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("onboarding.dashboardTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("onboarding.dashboardBody")}</p>
            </div>
          </div>

          <div className="pl-14 lg:pl-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-white dark:text-slate-900 dark:hover:bg-blue-100"
            >
              {t("onboarding.cta.openDashboard")}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
