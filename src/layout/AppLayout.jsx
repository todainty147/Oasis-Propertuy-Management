import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { PageTitleContext } from "./PageTitleContext";
import TenantSwitcher from "../components/TenantSwitcher";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export default function AppLayout({
  owners,
  activeOwnerId,
  setActiveOwnerId,
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [title, setTitle] = useState("");

  /* 🔒 Force sidebar open on desktop */
  useEffect(() => {
    if (isDesktop) setSidebarOpen(true);
  }, [isDesktop]);

  /* 📱 Close sidebar on navigation (mobile) */
  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

  /* 🛑 Prevent background scroll when sidebar open */
  useEffect(() => {
    document.body.style.overflow =
      !isDesktop && sidebarOpen ? "hidden" : "";
  }, [isDesktop, sidebarOpen]);

  return (
    <PageTitleContext.Provider value={{ setTitle }}>
      <div className="h-screen flex bg-slate-50 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          isDesktop={isDesktop}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col">
          <Topbar
            title={title}
            owners={owners}
            activeOwnerId={activeOwnerId}
            setActiveOwnerId={setActiveOwnerId}
            onMenuClick={() => setSidebarOpen((v) => !v)}
            /* ✅ TENANT SWITCHER RENDERED HERE */
            rightSlot={<TenantSwitcher />}
          />

          <main className="flex-1 overflow-y-auto pt-14 lg:pt-16 px-4 lg:px-8">
            <div className="max-w-7xl mx-auto w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </PageTitleContext.Provider>
  );
}
