// src/pages/OperatingCalendarPage.jsx
import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, List, RefreshCw } from "lucide-react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useOperatingCalendar } from "../hooks/useOperatingCalendar";
import { useProperties } from "../hooks/useProperties";
import { AgendaView } from "../components/calendar/AgendaView";
import { MonthView } from "../components/calendar/MonthView";
import { CalendarFilters } from "../components/calendar/CalendarFilters";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import OnboardingHintCard from "../components/OnboardingHintCard";

// ─── Date helpers ──────────────────────────────────────────────────────────────

function startOfMonth(year, month) {
  return new Date(year, month, 1);
}

function endOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ items }) {
  const counts = useMemo(() => {
    const c = { overdue: 0, due_soon: 0, scheduled: 0, blocked: 0 };
    for (const item of items) {
      if (item.status in c) c[item.status]++;
    }
    return c;
  }, [items]);

  if (items.length === 0) return null;

  const chips = [
    { key: "overdue",   label: "Overdue",   color: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"      },
    { key: "due_soon",  label: "Due soon",  color: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
    { key: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"   },
    { key: "blocked",   label: "Blocked",   color: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
  ].filter((c) => counts[c.key] > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Month summary">
      {chips.map((c) => (
        <span key={c.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.color}`}>
          {counts[c.key]} {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperatingCalendarPage() {
  usePageTitle("Operating Calendar");

  const { properties: ownerProperties = [] } = useProperties();

  const today = new Date();
  const [view,  setView]  = useState("agenda"); // "agenda" | "month"
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const [filters, setFilters] = useState({
    sourceModule: "",
    urgency:      "",
    status:       "",
    propertyId:   "",
  });

  const startDate = useMemo(() => startOfMonth(year, month), [year, month]);
  const endDate   = useMemo(() => endOfMonth(year, month),   [year, month]);

  const { items, loading, error, refetch } = useOperatingCalendar({
    enabled:      true,
    startDate,
    endDate,
    propertyId:   filters.propertyId   || null,
    sourceModule: filters.sourceModule || null,
    urgency:      filters.urgency      || null,
    status:       filters.status       || null,
  });

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else             { setMonth((m) => m - 1); }
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else              { setMonth((m) => m + 1); }
    setSelectedDay(null);
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(null);
  }

  const handleFiltersChange = useCallback((next) => {
    setFilters(next);
    setSelectedDay(null);
  }, []);

  return (
    <div className="space-y-4">
      <DashboardBreadcrumbs items={[{ label: "Operating Calendar" }]} />

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Operating Calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            All deadlines, renewals, compliance, and maintenance across your portfolio
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Calendar view">
            <button
              type="button"
              onClick={() => setView("agenda")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "agenda"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
              aria-pressed={view === "agenda"}
            >
              <List size={14} />
              Agenda
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-slate-200 dark:border-slate-700 transition-colors ${
                view === "month"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
              aria-pressed={view === "month"}
            >
              <CalendarDays size={14} />
              Month
            </button>
          </div>

          <button
            type="button"
            onClick={refetch}
            title="Refresh"
            aria-label="Refresh calendar"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-slate-900"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Month nav + summary */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-[140px] text-center">
            {monthLabel(year, month)}
          </span>

          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            onClick={goToToday}
            className="ml-2 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Today
          </button>
        </div>

        {!loading && <SummaryBar items={items} />}
      </div>

      {/* Filters */}
      <CalendarFilters
        filters={filters}
        onChange={handleFiltersChange}
        properties={ownerProperties ?? []}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load calendar data. Please try refreshing.
        </div>
      )}

      {/* Content */}
      <Card className="p-4 md:p-6">
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : view === "agenda" ? (
          <AgendaView items={items} />
        ) : (
          <MonthView
            items={items}
            year={year}
            month={month}
            selectedDay={selectedDay}
            onDaySelect={setSelectedDay}
          />
        )}
      </Card>

      {/* Onboarding hint */}
      {!loading && items.length === 0 && !error && (
        <OnboardingHintCard
          title="Your calendar is empty for this period"
          body="As you add properties, leases, payments, compliance items, and maintenance tasks, they will automatically appear here — keeping your whole portfolio on one timeline."
          />
      )}
    </div>
  );
}
