// src/components/calendar/MonthView.jsx
import { useMemo } from "react";
import { CalendarItemCard } from "./CalendarItemCard";

const STATUS_DOT = {
  overdue:   "bg-red-500",
  due_soon:  "bg-amber-400",
  scheduled: "bg-blue-400",
  completed: "bg-slate-300",
  blocked:   "bg-purple-500",
};

function buildMonthGrid(year, month) {
  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  // Week starts Monday (0=Mon … 6=Sun), adjust Sunday from JS 0→6
  const startDow  = (firstDay.getDay() + 6) % 7;
  const days = [];

  // Leading blank days
  for (let i = 0; i < startDow; i++) days.push(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Trailing blanks to complete last row
  while (days.length % 7 !== 0) days.push(null);

  return days;
}

function toDateKey(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({ items, year, month, onDaySelect, selectedDay }) {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const byDate = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!map[item.due_date]) map[item.due_date] = [];
      map[item.due_date].push(item);
    }
    return map;
  }, [items]);

  const todayKey = toDateKey(new Date());

  const selectedItems = selectedDay ? (byDate[selectedDay] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div>
        {/* DOW header */}
        <div className="grid grid-cols-7 mb-1">
          {DOW_LABELS.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7 border-t border-l border-slate-200 dark:border-slate-700">
          {grid.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`blank-${idx}`}
                  className="border-r border-b border-slate-200 dark:border-slate-700 min-h-[60px] bg-slate-50 dark:bg-slate-900/30"
                />
              );
            }

            const key      = toDateKey(day);
            const dayItems = byDate[key] ?? [];
            const isToday  = key === todayKey;
            const isSelected = key === selectedDay;

            // Top 3 dots, then +N
            const topItems = dayItems.slice(0, 3);
            const overflow = dayItems.length - topItems.length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onDaySelect?.(isSelected ? null : key)}
                className={`
                  border-r border-b border-slate-200 dark:border-slate-700
                  min-h-[60px] p-1 text-left transition-colors
                  ${isSelected ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}
                `}
                aria-label={`${day.getDate()} — ${dayItems.length} item${dayItems.length !== 1 ? "s" : ""}`}
                aria-pressed={isSelected}
              >
                <span
                  className={`
                    inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                    ${isToday
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 dark:text-slate-200"
                    }
                  `}
                >
                  {day.getDate()}
                </span>

                {/* Status dots */}
                {topItems.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {topItems.map((item) => (
                      <span
                        key={`${item.source_module}-${item.id}`}
                        className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[item.status] ?? "bg-slate-400"}`}
                        aria-hidden="true"
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-none self-center">
                        +{overflow}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" "}
            <span className="font-normal text-slate-400 dark:text-slate-500">
              — {selectedItems.length} {selectedItems.length === 1 ? "item" : "items"}
            </span>
          </h3>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No items on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <CalendarItemCard key={`${item.source_module}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
