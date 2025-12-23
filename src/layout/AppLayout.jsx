import { Outlet } from "react-router-dom";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({
  owners,
  activeOwnerId,
  setActiveOwnerId,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ======================
          MOBILE TOP BAR
         ====================== */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-white">
        <span className="font-semibold">Oasis Rental</span>

        <button onClick={() => setMobileOpen(true)}>
          <Menu size={24} />
        </button>
      </div>

      <div className="flex">
        {/* ======================
            SIDEBAR (DESKTOP + MOBILE DRAWER)
           ====================== */}
        <div
          className={`
            fixed inset-y-0 left-0 z-40 w-64 bg-white border-r
            transform transition-transform duration-200
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
            md:static md:translate-x-0
          `}
        >
          {/* Mobile close button */}
          <div className="md:hidden flex justify-end p-4">
            <button onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>

        {/* ======================
            MAIN CONTENT
           ====================== */}
        <main className="flex-1 p-4 lg:p-8 pt-6 md:ml-64">
          {/* Desktop top bar */}
          <div className="hidden md:block">
            <Topbar
              title=""
              owners={owners}
              activeOwnerId={activeOwnerId}
              setActiveOwnerId={setActiveOwnerId}
            />
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  );
}
