import { Bell, Search, Building2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Menu } from "lucide-react";



export default function Topbar({
  title,
  owners = [],
  activeOwnerId,
  setActiveOwnerId,
   onMenuClick, 
}) {
  return (
    <div className="flex justify-between items-center mb-8 gap-4">
      {/* LEFT */}
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
        {title}
      </h1>

      {/* RIGHT */}
      <div className="flex items-center gap-3">
        {/* OWNER SWITCHER */}
        {owners.length > 1 && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Building2 size={16} className="text-slate-400" />
            <select
              value={activeOwnerId}
              onChange={(e) =>
                setActiveOwnerId(Number(e.target.value))
              }
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
        

        {/* Menu Button*/}
        <button
  className="lg:hidden"
  onClick={onMenuClick}
>
  <Menu size={24} />
</button>


        {/* LOGOUT BUTTON */}
  
  <button
  onClick={() => supabase.auth.signOut()}
  className="text-sm text-slate-600 hover:text-slate-900"
>
  Wyloguj
</button>


        {/* SEARCH */}
        <div className="hidden sm:flex relative">
          <input
            type="text"
            placeholder="Szukaj..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
        </div>


        {/* NOTIFICATIONS */}
        <button className="p-2 relative bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
          <Bell size={20} />
          <span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full border border-white" />
        </button>
      </div>
    </div>

    
  );
  
}
