// src/components/calendar/AgendaView.jsx
import { CalendarItemCard } from "./CalendarItemCard";

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();

  if (isSameDay(d, today))    return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";

  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function isPast(dateStr) {
  const d = new Date(dateStr + "T23:59:59");
  return d < new Date();
}

export function AgendaView({ items }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-sm">No items in this period</p>
        <p className="text-xs mt-1">Try changing the date range or clearing filters</p>
      </div>
    );
  }

  // Group by due_date
  const groups = items.reduce((acc, item) => {
    const key = item.due_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(groups).sort();

  return (
    <div className="space-y-6">
      {sortedDates.map((dateStr) => (
        <section key={dateStr} aria-label={formatDayHeader(dateStr)}>
          <div className="flex items-center gap-3 mb-2">
            <h2
              className={`text-sm font-semibold ${
                isPast(dateStr)
                  ? "text-slate-600 dark:text-slate-400"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              {formatDayHeader(dateStr)}
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {groups[dateStr].length} {groups[dateStr].length === 1 ? "item" : "items"}
            </span>
            <div className="flex-1 border-t border-slate-200 dark:border-slate-700" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            {groups[dateStr].map((item) => (
              <CalendarItemCard key={`${item.source_module}-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
