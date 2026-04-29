import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Moon,
  ScrollText,
  Sun,
  UserRound,
  Wallet,
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
        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
          isActive
            ? "bg-slate-900 text-white shadow-sm dark:bg-blue-500 dark:text-slate-950"
            : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        }`
      }
    >
      <IconComponent size={18} />
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
      <TenantNavItem to="/tenant/documents" icon={FileText} label={t("tenantPortal.shell.nav.documents")} />
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

  const titleText = title || t("tenantPortal.shell.defaultTitle");
  const email = useMemo(() => user?.email || "", [user?.email]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <PageTitleContext.Provider value={{ setTitle }}>
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
          <aside className="border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900 lg:min-h-screen lg:w-[320px] lg:border-b-0 lg:border-r lg:px-6 lg:py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
                  {t("tenantPortal.shell.eyebrow")}
                </p>
                <h1 className="mt-1 text-xl font-semibold">{t("tenantPortal.shell.title")}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {activeAccount?.name || t("tenantPortal.shell.accountFallback")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white"
                aria-label={t("tenantPortal.shell.toggleTheme")}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("tenantPortal.shell.accountLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                {email || t("tenantPortal.shell.accountFallback")}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("tenantPortal.shell.accountHint")}
              </p>
            </div>

            {isDesktop ? (
              <div className="mt-5">
                <TenantPortalNav />
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2 lg:mt-auto lg:grid-cols-1">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">{t("topbar.language")}</span>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-right outline-none"
                  aria-label={t("topbar.language")}
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
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:text-white"
              >
                <LogOut size={16} />
                <span>{t("topbar.logout")}</span>
              </button>
            </div>
          </aside>

          <div className="flex-1">
            <header className="border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:px-8 lg:py-5">
              <div className="mx-auto flex max-w-6xl flex-col gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("tenantPortal.shell.headerKicker")}
                </p>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">{titleText}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                      {t("tenantPortal.shell.headerBody")}
                    </p>
                  </div>
                  {!isDesktop ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                      <TenantPortalNav />
                    </div>
                  ) : null}
                </div>
              </div>
            </header>

            <main className="px-4 py-5 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-6xl">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </PageTitleContext.Provider>
  );
}
