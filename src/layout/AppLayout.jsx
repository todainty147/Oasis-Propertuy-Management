import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({
  owners,
  activeOwnerId,
  setActiveOwnerId,
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <main className="flex-1 lg:ml-64 p-4 lg:p-8 pt-8">
        <Topbar
          title=""
          owners={owners}
          activeOwnerId={activeOwnerId}
          setActiveOwnerId={setActiveOwnerId}
        />

        <Outlet />
      </main>
    </div>
  );
}
