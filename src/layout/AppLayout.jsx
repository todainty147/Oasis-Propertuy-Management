import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 🔒 Deterministic desktop behavior
  useEffect(() => {
    if (isDesktop) setSidebarOpen(true);
  }, [isDesktop]);

  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        isDesktop={isDesktop}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col">
        <Topbar
          owners={owners}
          activeOwnerId={activeOwnerId}
          setActiveOwnerId={setActiveOwnerId}
          onMenuClick={() => setSidebarOpen((v) => !v)}
        />

        <main className="flex-1 overflow-y-auto pt-14 lg:pt-16 px-4 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
