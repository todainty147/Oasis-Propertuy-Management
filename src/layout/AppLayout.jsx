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
      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* Main content */}
      <div className="lg:pl-64">
        <Topbar
          title=""
          owners={owners}
          activeOwnerId={activeOwnerId}
          setActiveOwnerId={setActiveOwnerId}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
