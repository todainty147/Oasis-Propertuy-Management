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
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-6 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_36%)]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">{t("onboarding.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{t("onboarding.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">{t("onboarding.subtitle")}</p>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-white">{t("onboarding.dashboardCardTitle")}</p>
              <p className="mt-1 text-sm text-slate-300">{t("onboarding.dashboardCardBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-white">{t("onboarding.invitesCardTitle")}</p>
              <p className="mt-1 text-sm text-slate-300">{t("onboarding.invitesCardBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-white">{t("onboarding.maintenanceCardTitle")}</p>
              <p className="mt-1 text-sm text-slate-300">{t("onboarding.maintenanceCardBody")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {STEP_META.map(({ key, icon: Icon, ctaPath, ctaKey }, idx) => (
          <Card
            key={key}
            className={`group border border-slate-800 p-5 transition hover:border-blue-500 hover:shadow-md ${
              idx === STEP_META.length - 1 ? "lg:col-span-2" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-300">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                    {t("onboarding.stepLabel", { number: idx + 1 })}
                  </p>
                  <h3 className="text-base font-semibold text-slate-100">{t(`onboarding.${key}.title`)}</h3>
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-300">{t(`onboarding.${key}.body`)}</p>

            <div className="mt-4">
              <Link
                to={ctaPath}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-blue-400 hover:text-blue-200"
              >
                {t(`onboarding.${ctaKey}`)}
                <ArrowRight size={16} />
              </Link>
            </div>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-900/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300">
              <LayoutDashboard size={18} />
            </div>
            <div className="max-w-3xl">
              <h3 className="text-base font-semibold text-slate-100">{t("onboarding.dashboardTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{t("onboarding.dashboardBody")}</p>
            </div>
          </div>

          <div className="pl-14 lg:pl-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-blue-400 hover:text-blue-200"
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
