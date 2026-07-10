import { createElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BriefcaseBusiness, CreditCard, Home, LayoutDashboard, UserPlus, Wrench } from "lucide-react";
import Card from "../components/Card";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import { useAccount } from "../context/AccountContext";
import { getAccountSandboxStatus, resetDemoAccount, seedDemoAccountFixtures } from "../services/selfServeSignupService";

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
  const { activeAccountId, activeRole } = useAccount();
  const [sandboxStatus, setSandboxStatus] = useState(null);
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [sandboxActionMessage, setSandboxActionMessage] = useState("");
  const [sandboxActionError, setSandboxActionError] = useState("");

  const role = String(activeRole ?? "").toLowerCase();
  const isOwner = role === "owner";

  useEffect(() => {
    setTitle(t("onboarding.pageTitle"));
  }, [setTitle, t]);

  useEffect(() => {
    let cancelled = false;

    async function loadSandboxStatus() {
      if (!activeAccountId || !isOwner) {
        setSandboxStatus(null);
        return;
      }

      try {
        const status = await getAccountSandboxStatus(activeAccountId);
        if (!cancelled) setSandboxStatus(status);
      } catch (error) {
        console.warn("Sandbox status load failed:", error);
        if (!cancelled) setSandboxStatus(null);
      }
    }

    loadSandboxStatus();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, isOwner]);

  if (!isOwner) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-600">{t("onboarding.accessDenied")}</p>
      </Card>
    );
  }

  async function refreshSandboxStatus() {
    if (!activeAccountId || !isOwner) return;
    const status = await getAccountSandboxStatus(activeAccountId);
    setSandboxStatus(status);
  }

  async function handleSandboxAction() {
    if (!activeAccountId || !sandboxStatus?.is_demo) return;

    setSandboxBusy(true);
    setSandboxActionError("");
    setSandboxActionMessage("");

    try {
      const result = sandboxStatus.seeded_fixture_version
        ? await resetDemoAccount(activeAccountId)
        : await seedDemoAccountFixtures(activeAccountId, { forceReset: false });

      await refreshSandboxStatus();
      setSandboxActionMessage(
        t(
          sandboxStatus.seeded_fixture_version
            ? "onboarding.sandbox.resetSuccess"
            : "onboarding.sandbox.seedSuccess",
          {
            properties: result.property_count,
            requests: result.maintenance_request_count,
          },
        ),
      );
    } catch (error) {
      setSandboxActionError(error?.message || t("onboarding.sandbox.actionError"));
    } finally {
      setSandboxBusy(false);
    }
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

      {sandboxStatus?.is_demo ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
            {t("onboarding.sandbox.eyebrow")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {t("onboarding.sandbox.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700 dark:text-slate-200">
            {t("onboarding.sandbox.body")}
          </p>
          <p className="mt-3 text-xs font-medium text-amber-900 dark:text-amber-100">
            {sandboxStatus.seeded_fixture_version
              ? t("onboarding.sandbox.ready", { version: sandboxStatus.seeded_fixture_version })
              : t("onboarding.sandbox.notSeeded")}
          </p>
          {sandboxStatus.demo_expires_at ? (
            <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-100">
              {t("onboarding.sandbox.expires", {
                date: new Date(sandboxStatus.demo_expires_at).toLocaleDateString(),
              })}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSandboxAction}
              disabled={sandboxBusy}
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-amber-100"
            >
              {sandboxBusy
                ? t("onboarding.sandbox.working")
                : sandboxStatus.seeded_fixture_version
                  ? t("onboarding.sandbox.resetCta")
                  : t("onboarding.sandbox.seedCta")}
            </button>
            {sandboxActionMessage ? (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{sandboxActionMessage}</p>
            ) : null}
            {sandboxActionError ? (
              <p className="text-xs font-medium text-red-700 dark:text-red-300">{sandboxActionError}</p>
            ) : null}
          </div>
        </section>
      ) : null}

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
                  {createElement(Icon, { size: 18 })}
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

      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-sky-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/80">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 opacity-80" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
              Moving from a spreadsheet?
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              Import your existing data
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Upload a CSV to import properties, tenancies, compliance records, and maintenance
              history in bulk. Each row is processed individually so one bad row won&apos;t block
              the rest.
            </p>
          </div>
          <div className="shrink-0">
            <Link
              to="/settings/data-import"
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-white dark:text-slate-900 dark:hover:bg-blue-100"
            >
              Open import wizard
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
