import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { PageTitleContext } from "./PageTitleContext";
import PasswordUpgradeNotice from "../components/security/PasswordUpgradeNotice";
import MobileBottomNav from "../components/mobile/MobileBottomNav";
import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export default function AppLayout({ owners, activeOwnerId, setActiveOwnerId }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const location  = useLocation();
  const { user }  = useAuth();
  const { activeAccountId } = useAccount();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [title, setTitle] = useState("");

  // Keep sidebar open on desktop
  useEffect(() => {
    if (isDesktop) setSidebarOpen(true);
  }, [isDesktop]);

  // Close sidebar on mobile navigation
  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

  // The authenticated app shell owns scrolling via <main>. Keep the document
  // locked so pages cannot create a second browser scrollbar with blank space.
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

  return (
    <PageTitleContext.Provider value={{ setTitle }}>
      {/*
        Two-surface shell:
          · Sidebar tint  bg-[#F5F5F7]  (macOS sidebar gray)
          · Content white bg-white
        The outer wrapper clips everything to the viewport height.
        Only <main> scrolls — the topbar is a non-fixed flex child
        (shrink-0 h-11) so no compensating padding-top is needed.
      */}
      <div className="h-screen flex bg-[#F5F5F7] dark:bg-[#1C1C1E] overflow-hidden text-slate-900 dark:text-slate-100">

        <Sidebar
          open={sidebarOpen}
          isDesktop={isDesktop}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Right column — topbar + scrollable content */}
        <div className="flex-1 flex flex-col min-w-0 tenaqo-app-surface">

          <Topbar
            onMenuClick={() => setSidebarOpen((v) => !v)}
          />

          {/* Scrollable page content
              px-6 gives a consistent 24px gutter on both sides.
              pb-[72px] clears the mobile bottom nav bar.
              No pt — topbar occupies its own row in the flex column. */}
          <main className="flex-1 overflow-y-auto px-4 pb-[72px] sm:px-6 lg:pb-0">
            <div className="max-w-7xl mx-auto w-full pb-8 space-y-6">
              <PasswordUpgradeNotice userId={user?.id} accountId={activeAccountId} />
              <Outlet />
            </div>
          </main>

        </div>
      </div>

      {/* Role-aware mobile bottom navigation */}
      <MobileBottomNav />
    </PageTitleContext.Provider>
  );
}
