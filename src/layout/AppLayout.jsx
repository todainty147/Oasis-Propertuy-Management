import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useState } from "react";

export default function AppLayout({
  owners,
  activeOwnerId,
  setActiveOwnerId,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* SIDEBAR */}
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* CONTENT */}
      <div className="lg:ml-64">
        <Topbar
          title=""
          owners={owners}
          activeOwnerId={activeOwnerId}
          setActiveOwnerId={setActiveOwnerId}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="pt-14 lg:pt-16 px-4 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
