// src/components/calendar/CalendarItemCard.jsx
import { Link } from "react-router-dom";
import {
  Wallet,
  FileText,
  Shield,
  Wrench,
  ClipboardList,
  CalendarClock,
  Star,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { formatCurrencyAmount } from "../../utils/currency";
import { useAccount } from "../../context/AccountContext";

const MODULE_META = {
  payment:     { label: "Rent",         Icon: Wallet        },
  lease:       { label: "Lease",        Icon: FileText      },
  compliance:  { label: "Compliance",   Icon: Shield        },
  maintenance: { label: "Maintenance",  Icon: Wrench        },
  work_order:  { label: "Work order",   Icon: ClipboardList },
  preventive:  { label: "Preventive",   Icon: CalendarClock },
  custom:      { label: "Custom",       Icon: Star          },
};

const STATUS_STYLES = {
  overdue:   { pill: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",   dot: "bg-red-500",    border: "border-l-red-500"    },
  due_soon:  { pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300", dot: "bg-amber-400", border: "border-l-amber-400"  },
  scheduled: { pill: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",   dot: "bg-blue-400",   border: "border-l-blue-400"   },
  completed: { pill: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",  dot: "bg-slate-400",  border: "border-l-slate-300"  },
  blocked:   { pill: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300", dot: "bg-purple-500", border: "border-l-purple-500" },
};

const URGENCY_LABELS = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
};

function statusLabel(status) {
  return {
    overdue:   "Overdue",
    due_soon:  "Due soon",
    scheduled: "Scheduled",
    completed: "Completed",
    blocked:   "Blocked",
  }[status] ?? status;
}

export function CalendarItemCard({ item }) {
  const { activeCurrency } = useAccount();
  const styles  = STATUS_STYLES[item.status] ?? STATUS_STYLES.scheduled;
  const meta    = MODULE_META[item.source_module] ?? { label: item.source_module, Icon: Star };
  const { Icon } = meta;

  const content = (
    <div
      className={`
        flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700
        bg-white dark:bg-slate-900 border-l-4 ${styles.border}
        hover:shadow-sm transition-shadow
      `}
    >
      {/* Status dot + icon */}
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} aria-hidden="true" />
        <Icon size={14} className="text-slate-400 dark:text-slate-500 mt-1" aria-hidden="true" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${styles.pill}`}>
            {statusLabel(item.status)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{meta.label}</span>
          {item.property_label && item.property_label !== "—" && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">· {item.property_label}</span>
          )}
          {item.urgency === "critical" && (
            <AlertTriangle size={11} className="text-red-500 shrink-0" aria-label="Critical urgency" />
          )}
          {item.is_attested_import && (
            <span data-testid="attested-calendar-badge" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border border-sky-200 bg-sky-50 text-sky-700">
              Attested import
            </span>
          )}
        </div>
        {item.tenant_label && item.tenant_label !== "—" && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.tenant_label}</p>
        )}
      </div>

      {/* Amount + chevron */}
      <div className="flex items-center gap-1 shrink-0">
        {item.amount != null && (
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {formatCurrencyAmount(item.amount, { currency: activeCurrency })}
          </span>
        )}
        {item.link_path && (
          <ChevronRight size={14} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  if (item.link_path) {
    return (
      <Link to={item.link_path} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
