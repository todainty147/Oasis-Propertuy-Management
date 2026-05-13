// src/components/calendar/CalendarFilters.jsx
import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

const SOURCE_OPTIONS = [
  { value: "",            label: "All sources"    },
  { value: "payment",     label: "Rent"           },
  { value: "lease",       label: "Lease"          },
  { value: "compliance",  label: "Compliance"     },
  { value: "maintenance", label: "Maintenance"    },
  { value: "work_order",  label: "Work orders"    },
  { value: "preventive",  label: "Preventive"     },
  { value: "custom",      label: "Custom"         },
];

const URGENCY_OPTIONS = [
  { value: "",         label: "All urgency"  },
  { value: "critical", label: "Critical"     },
  { value: "high",     label: "High"         },
  { value: "medium",   label: "Medium"       },
  { value: "low",      label: "Low"          },
];

const STATUS_OPTIONS = [
  { value: "",          label: "All statuses" },
  { value: "overdue",   label: "Overdue"      },
  { value: "due_soon",  label: "Due soon"     },
  { value: "scheduled", label: "Scheduled"    },
  { value: "completed", label: "Completed"    },
  { value: "blocked",   label: "Blocked"      },
];

function Select({ value, onChange, options, label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function CalendarFilters({ filters, onChange, properties = [] }) {
  const [open, setOpen] = useState(false);

  const hasActiveFilters = filters.sourceModule || filters.urgency || filters.status || filters.propertyId;

  function clearFilters() {
    onChange({ sourceModule: "", urgency: "", status: "", propertyId: "" });
  }

  return (
    <div className="space-y-2">
      {/* Toggle row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            open || hasActiveFilters
              ? "border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300"
              : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900"
          }`}
        >
          <SlidersHorizontal size={14} />
          Filters
          {hasActiveFilters && (
            <span className="ml-0.5 px-1.5 py-0 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-5">
              {[filters.sourceModule, filters.urgency, filters.status, filters.propertyId].filter(Boolean).length}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Filter controls */}
      {open && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <Select
            label="Source module"
            value={filters.sourceModule}
            onChange={(v) => onChange({ ...filters, sourceModule: v })}
            options={SOURCE_OPTIONS}
          />
          <Select
            label="Urgency"
            value={filters.urgency}
            onChange={(v) => onChange({ ...filters, urgency: v })}
            options={URGENCY_OPTIONS}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => onChange({ ...filters, status: v })}
            options={STATUS_OPTIONS}
          />
          {properties.length > 0 && (
            <Select
              label="Property"
              value={filters.propertyId}
              onChange={(v) => onChange({ ...filters, propertyId: v })}
              options={[
                { value: "", label: "All properties" },
                ...properties.map((p) => ({ value: p.id, label: p.address ?? p.id })),
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
