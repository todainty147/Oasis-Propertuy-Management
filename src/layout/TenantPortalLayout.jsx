import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "../components/BrandLogo";
import PasswordUpgradeNotice from "../components/security/PasswordUpgradeNotice";
import {
  FileText,
  FileCheck2,
  Home,
  LayoutDashboard,
  LogOut,
  Moon,
  ScrollText,
  Sun,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";
import { APP_LANGUAGES } from "../i18n/languages";
import { PageTitleContext } from "./PageTitleContext";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

function TenantNavItem({ to, icon, label }) {
  const IconComponent = icon;

  return (
    <NavLink
      to={to}
      end={to === "/tenant/home"}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 ${
          isActive
            ? "bg-black/[0.07] text-slate-950 dark:bg-white/[0.09] dark:text-white"
            : "text-slate-600 hover:bg-black/[0.04] hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
        }`
      }
    >
      <IconComponent size={18} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

function TenantPortalNav() {
  const { t } = useI18n();

  return (
    <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      <TenantNavItem to="/tenant/home" icon={LayoutDashboard} label={t("tenantPortal.shell.nav.home")} />
      <TenantNavItem to="/tenant/lease" icon={ScrollText} label={t("tenantPortal.shell.nav.lease")} />
      <TenantNavItem to="/tenant/property" icon={Home} label={t("tenantPortal.shell.nav.homeDetails")} />
      <TenantNavItem to="/tenant/maintenance" icon={Wrench} label={t("tenantPortal.shell.nav.maintenance")} />
      <TenantNavItem to="/tenant/documents" icon={FileText} label={t("tenantPortal.shell.nav.documents")} />
      <TenantNavItem to="/tenant/evidence-reports" icon={FileCheck2} label="Evidence Reports" />
      <TenantNavItem to="/tenant/payments" icon={Wallet} label={t("tenantPortal.shell.nav.payments")} />
      <TenantNavItem to="/tenant/profile" icon={UserRound} label={t("tenantPortal.shell.nav.profile")} />
    </nav>
  );
}

export default function TenantPortalLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { activeAccount } = useAccount();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [title, setTitle] = useState("");
  const mainRef = useRef(null);

  const titleText = title || t("tenantPortal.shell.defaultTitle");
  const email = useMemo(() => user?.email || "", [user?.email]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <PageTitleContext.Provider value={{ setTitle }}>
      <div className="tenaqo-app-surface h-screen overflow-hidden">
        <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
          <aside className="flex shrink-0 flex-col border-b border-black/[0.06] bg-[#F5F5F7] px-4 py-4 dark:border-white/[0.08] dark:bg-[#1C1C1E] lg:h-screen lg:w-[320px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-6 lg:py-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-3">
                <BrandLogo
                  variant="sidebar"
                  showSubtitle={false}
                  accountBranding={activeAccount}
                />
                <div>
                  <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t("tenantPortal.shell.title")}</h1>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {activeAccount?.name || t("tenantPortal.shell.accountFallback")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:text-white"
                aria-label={t("tenantPortal.shell.toggleTheme")}
              >
                {theme === "dark" ? (
                  <Sun size={16} aria-hidden="true" />
                ) : (
                  <Moon size={16} aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-black/[0.08] bg-white/75 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.045]">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {t("tenantPortal.shell.accountLabel")}
              </p>
              <p className="mt-2 break-words text-sm font-medium text-[var(--text-primary)]">
                {email || t("tenantPortal.shell.accountFallback")}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {t("tenantPortal.shell.accountHint")}
              </p>
            </div>

            {isDesktop ? (
              <div className="mt-5">
                <TenantPortalNav />
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2 lg:mt-auto lg:grid-cols-1">
              <label className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white/75 px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-white/[0.045]">
                <span className="text-[var(--text-muted)]">{t("topbar.language")}</span>
                <select
                  name="tenant-portal-language"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-right text-[var(--text-primary)] outline-none"
                >
                  {APP_LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {t(language.labelKey)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white/75 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:border-white/[0.08] dark:bg-white/[0.045]"
              >
                <LogOut size={16} aria-hidden="true" />
                <span>{t("topbar.logout")}</span>
              </button>
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-[var(--border-soft)] bg-[var(--surface-1)]/85 px-4 py-4 backdrop-blur lg:px-8 lg:py-5">
              <div className="mx-auto flex max-w-6xl flex-col gap-2">
                <p className="text-sm text-[var(--text-muted)]">
                  {t("tenantPortal.shell.headerKicker")}
                </p>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-normal text-[var(--text-primary)] lg:text-3xl">{titleText}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                      {t("tenantPortal.shell.headerBody")}
                    </p>
                  </div>
                  {!isDesktop ? (
                    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-3">
                      <TenantPortalNav />
                    </div>
                  ) : null}
                </div>
              </div>
            </header>

            <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-6xl space-y-4">
                <PasswordUpgradeNotice
                  userId={user?.id}
                  accountId={activeAccount?.id}
                  profilePath="/tenant/profile"
                />
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </PageTitleContext.Provider>
  );
}
