// src/layout/Topbar.jsx
import { Menu, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "./PageTitleContext";
import NotificationsBell from "../components/NotificationsBell";
import BrandLogo from "../components/BrandLogo";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";
import { APP_LANGUAGES } from "../i18n/languages";
import { useTenant } from "../context/TenantContext";
import { useAuth } from "../context/AuthContext";

function Segment({ items, active, onChange }) {
  return (
    <div className="flex rounded-lg bg-black/[0.05] dark:bg-white/[0.05] p-[3px] gap-[3px]">
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex-1 py-[5px] text-[11px] rounded-md transition-colors ${
            active === key
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MenuDivider() {
  return <div className="border-t border-black/[0.05] dark:border-white/[0.05]" />;
}

/* ─────────────────────────────────────────────
   USER MENU
   Avatar circle → popover with:
     · identity row
     · profile link
     · theme segmented control
     · language segmented control
     · sign out
   Self-contained: owns its own hooks so Topbar
   stays dependency-free.
───────────────────────────────────────────── */

function UserMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clearTenant } = useTenant();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  async function handleLogout() {
    setOpen(false);
    clearTenant();
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  const email   = user?.email ?? "";
  const initial = email[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      {/* Avatar button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open user menu"
        aria-expanded={open}
        className="w-7 h-7 rounded-full bg-slate-600 dark:bg-slate-500 flex items-center justify-center text-white text-[12px] font-semibold select-none hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      >
        {initial}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[232px] rounded-xl bg-white dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-50 overflow-hidden">

          {/* Identity */}
          <div className="px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-600 dark:bg-slate-500 flex items-center justify-center text-white text-[13px] font-semibold shrink-0">
                {initial}
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate leading-snug">
                {email || t("topbar.profile")}
              </p>
            </div>
          </div>

          <MenuDivider />

          {/* Profile link */}
          <div className="px-1.5 py-1.5">
            <Link
              to="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center px-2.5 py-1.5 rounded-md text-[13px] text-slate-700 dark:text-slate-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
            >
              {t("topbar.profile")}
            </Link>
          </div>

          <MenuDivider />

          {/* Theme */}
          <div className="px-3.5 py-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {t("topbar.theme")}
            </p>
            <Segment
              items={[
                { key: "light",  label: t("theme.light")  },
                { key: "system", label: t("theme.system") },
                { key: "dark",   label: t("theme.dark")   },
              ]}
              active={theme}
              onChange={setTheme}
            />
          </div>

          <MenuDivider />

          {/* Language */}
          <div className="px-3.5 py-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {t("topbar.language")}
            </p>
            <Segment
              items={APP_LANGUAGES.map((l) => ({
                key:   l.code,
                label: `${l.flag} ${l.code.toUpperCase()}`,
              }))}
              active={lang}
              onChange={setLang}
            />
          </div>

          <MenuDivider />

          {/* Sign out */}
          <div className="px-1.5 py-1.5">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left flex items-center px-2.5 py-1.5 rounded-md text-[13px] text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
            >
              {t("topbar.logout")}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   TOPBAR
   44px (h-11). Not fixed — lives as a shrink-0
   flex child inside the right column so the
   main content scrolls beneath it without any
   compensating padding-top.
───────────────────────────────────────────── */

export default function Topbar({ onMenuClick }) {
  const { title } = usePageTitle();

  return (
    <header className="shrink-0 h-11 flex items-center gap-3 px-4 bg-white dark:bg-slate-900 border-b border-black/[0.06] dark:border-white/[0.06] z-10">

      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Open sidebar"
        className="lg:hidden p-1.5 -ml-1 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
      >
        <Menu size={17} strokeWidth={1.8} />
      </button>

      <BrandLogo
        variant="header"
        compact
        showSubtitle={false}
        className="lg:hidden"
      />

      {/* Page label
          · Mobile: full page title, 14px semibold (gives context without sidebar)
          · Desktop: same text at 13px medium, muted — the page's own h1 takes the lead */}
      <p
        className={`flex-1 min-w-0 truncate ${
          title
            ? "text-[14px] font-semibold text-slate-700 dark:text-slate-200 lg:text-[13px] lg:font-medium lg:text-slate-600 lg:dark:text-slate-300"
            : ""
        }`}
      >
        {title}
      </p>

      {/* Right actions */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Search"
          className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
        >
          <Search size={15} strokeWidth={1.8} />
        </button>

        <NotificationsBell />

        <div className="ml-2">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
