import { Bell, Search, Building2, Menu } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Topbar({
  title = "",
  owners = [],
  activeOwnerId,
  setActiveOwnerId,
  onMenuClick,
}) {
  return (
    <header className="
      fixed top-0 left-0 right-0
      h-14 lg:h-16
      bg-white border-b border-slate-200
      flex items-center
      px-4 lg:px-8
      z-30
      lg:left-64
    ">
      {/* LEFT */}
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded hover:bg-slate-100"
          aria-label="Otwórz menu"
        >
          <Menu size={22} />
        </button>

        <h1 className="text-lg lg:text-2xl font-bold text-slate-900 truncate">
          {title}
        </h1>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3">
        {owners.length > 1 && (
          <div className="hidden sm:flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
            <Building2 size={16} className="text-slate-400" />
            <select
              value={activeOwnerId}
              onChange={(e) => setActiveOwnerId(Number(e.target.value))}
              className="text-sm bg-transparent focus:outline-none"
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="hidden md:flex relative">
          <input
            type="text"
            placeholder="Szukaj..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
        </div>

        <button className="p-2 relative border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white" />
        </button>

        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Wyloguj
        </button>
      </div>
    </header>
  );
}
