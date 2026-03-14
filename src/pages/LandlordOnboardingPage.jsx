import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Gift, Rocket, Users } from "lucide-react";
import Card from "../components/Card";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import { useAccount } from "../context/AccountContext";

const STEP_META = [
  { key: "step1", icon: Rocket, ctaPath: "/properties", ctaKey: "cta.addProperty" },
  { key: "step2", icon: Users, ctaPath: "/invitations", ctaKey: "cta.inviteTeam" },
  { key: "step3", icon: CheckCircle2, ctaPath: "/maintenance-inbox", ctaKey: "cta.openInbox" },
  { key: "step4", icon: Gift, ctaPath: "/settings/branding", ctaKey: "cta.setupBranding" },
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
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 p-6 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative z-10">
          <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-blue-50">{t("onboarding.subtitle")}</p>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/30 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wide text-blue-100">{t("onboarding.offerLabel")}</p>
              <p className="mt-1 text-lg font-semibold">{t("onboarding.offerFirstMonth")}</p>
            </div>
            <div className="rounded-xl border border-white/30 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wide text-blue-100">{t("onboarding.referralLabel")}</p>
              <p className="mt-1 text-lg font-semibold">{t("onboarding.offerReferral")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {STEP_META.map(({ key, icon: Icon, ctaPath, ctaKey }, idx) => (
          <Card key={key} className="group border border-slate-200 p-5 transition hover:border-blue-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {t("onboarding.stepLabel", { number: idx + 1 })}
                  </p>
                  <h3 className="text-base font-semibold text-slate-900">{t(`onboarding.${key}.title`)}</h3>
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-600">{t(`onboarding.${key}.body`)}</p>

            <div className="mt-4">
              <Link
                to={ctaPath}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              >
                {t(`onboarding.${ctaKey}`)}
                <ArrowRight size={16} />
              </Link>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
