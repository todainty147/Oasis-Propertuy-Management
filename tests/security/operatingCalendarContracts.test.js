// tests/security/operatingCalendarContracts.test.js
// Contract tests for the Operating Calendar feature.
// These tests verify the SQL, service, hook, and frontend meet the design spec
// without requiring a running database.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

const sql     = readFileSync(path.join(root, "supabase/operating_calendar.sql"), "utf8");
const service = readFileSync(path.join(root, "src/services/operatingCalendarService.js"), "utf8");
const hook    = readFileSync(path.join(root, "src/hooks/useOperatingCalendar.js"), "utf8");
const page    = readFileSync(path.join(root, "src/pages/OperatingCalendarPage.jsx"), "utf8");
const sidebar = readFileSync(path.join(root, "src/layout/Sidebar.jsx"), "utf8");
const routes  = readFileSync(path.join(root, "src/routes/ManagerRoutes.jsx"), "utf8");
const dbApply = readFileSync(path.join(root, "scripts/dbApplyRepoSql.js"), "utf8");

// ─── SQL: custom calendar items table ─────────────────────────────────────────

describe("operating_calendar_items table", () => {
  it("creates the operating_calendar_items table", () => {
    expect(sql).toContain("create table if not exists public.operating_calendar_items");
  });

  it("has required columns: id, account_id, title, due_date, status, urgency", () => {
    expect(sql).toContain("id           uuid");
    expect(sql).toContain("account_id");
    expect(sql).toContain("title");
    expect(sql).toContain("due_date");
    expect(sql).toContain("status");
    expect(sql).toContain("urgency");
  });

  it("enforces status check constraint with all valid statuses", () => {
    const block = sql.slice(sql.indexOf("operating_calendar_items_status_check"));
    expect(block).toContain("scheduled");
    expect(block).toContain("due_soon");
    expect(block).toContain("overdue");
    expect(block).toContain("completed");
    expect(block).toContain("blocked");
  });

  it("enforces urgency check constraint with all four urgency levels", () => {
    const block = sql.slice(sql.indexOf("operating_calendar_items_urgency_check"));
    expect(block).toContain("critical");
    expect(block).toContain("high");
    expect(block).toContain("medium");
    expect(block).toContain("low");
  });

  it("enables row-level security on the table", () => {
    expect(sql).toContain("alter table public.operating_calendar_items enable row level security");
  });

  it("uses assert_manage_account_access for the RLS policy", () => {
    const policy = sql.slice(sql.indexOf("account_members_manage_calendar_items"));
    expect(policy).toContain("assert_manage_account_access");
  });

  it("creates an index on account_id and due_date", () => {
    expect(sql).toContain("operating_calendar_items_account_due_idx");
    expect(sql).toContain("on public.operating_calendar_items(account_id, due_date)");
  });
});

// ─── SQL: get_operating_calendar RPC ──────────────────────────────────────────

describe("get_operating_calendar RPC — definition", () => {
  it("drops and re-creates the function idempotently", () => {
    expect(sql).toContain("drop function if exists public.get_operating_calendar");
    expect(sql).toContain("create function public.get_operating_calendar");
  });

  it("accepts all required parameters", () => {
    const sig = sql.slice(
      sql.indexOf("create function public.get_operating_calendar"),
      sql.indexOf("returns table"),
    );
    expect(sig).toContain("p_account_id");
    expect(sig).toContain("p_start_date");
    expect(sig).toContain("p_end_date");
    expect(sig).toContain("p_property_id");
    expect(sig).toContain("p_source_module");
    expect(sig).toContain("p_urgency");
    expect(sig).toContain("p_status");
  });

  it("is declared security definer", () => {
    expect(sql).toContain("security definer");
  });

  it("sets search_path to public", () => {
    expect(sql).toContain("set search_path = public");
  });

  it("calls assert_manage_account_access for authorization", () => {
    expect(sql).toContain("assert_manage_account_access(p_account_id)");
  });

  it("returns the required columns", () => {
    const returnBlock = sql.slice(
      sql.indexOf("returns table ("),
      sql.indexOf("language sql"),
    );
    expect(returnBlock).toContain("id");
    expect(returnBlock).toContain("source_module");
    expect(returnBlock).toContain("title");
    expect(returnBlock).toContain("due_date");
    expect(returnBlock).toContain("status");
    expect(returnBlock).toContain("urgency");
    expect(returnBlock).toContain("property_id");
    expect(returnBlock).toContain("property_label");
    expect(returnBlock).toContain("tenant_id");
    expect(returnBlock).toContain("tenant_label");
    expect(returnBlock).toContain("amount");
    expect(returnBlock).toContain("link_path");
    expect(returnBlock).toContain("notes");
  });

  it("grants execute to authenticated role", () => {
    expect(sql).toContain("grant execute on function public.get_operating_calendar");
    expect(sql).toContain("to authenticated");
  });

  it("is wrapped in a transaction", () => {
    expect(sql).toContain("begin;");
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});

// ─── SQL: all 7 source modules ────────────────────────────────────────────────

describe("get_operating_calendar RPC — source module coverage", () => {
  it("unions payment rows", () => {
    expect(sql).toContain("payment_rows as (");
    expect(sql).toContain("'payment'::text");
  });

  it("unions lease expiry rows", () => {
    expect(sql).toContain("lease_rows as (");
    expect(sql).toContain("'lease'::text");
  });

  it("unions compliance item rows", () => {
    expect(sql).toContain("compliance_rows as (");
    expect(sql).toContain("'compliance'::text");
  });

  it("unions maintenance request rows", () => {
    expect(sql).toContain("maintenance_rows as (");
    expect(sql).toContain("'maintenance'::text");
  });

  it("unions work order rows", () => {
    expect(sql).toContain("work_order_rows as (");
    expect(sql).toContain("'work_order'::text");
  });

  it("unions preventive maintenance task rows", () => {
    expect(sql).toContain("preventive_rows as (");
    expect(sql).toContain("'preventive'::text");
  });

  it("unions custom calendar item rows", () => {
    expect(sql).toContain("custom_rows as (");
    expect(sql).toContain("'custom'::text");
  });

  it("final union includes all 7 source CTEs", () => {
    const unionBlock = sql.slice(sql.indexOf("all_items as ("));
    expect(unionBlock).toContain("payment_rows");
    expect(unionBlock).toContain("lease_rows");
    expect(unionBlock).toContain("compliance_rows");
    expect(unionBlock).toContain("maintenance_rows");
    expect(unionBlock).toContain("work_order_rows");
    expect(unionBlock).toContain("preventive_rows");
    expect(unionBlock).toContain("custom_rows");
  });
});

// ─── SQL: status derivation contracts ─────────────────────────────────────────

describe("get_operating_calendar RPC — status derivation", () => {
  it("marks paid payments as completed", () => {
    const block = sql.slice(sql.indexOf("payment_rows as ("), sql.indexOf("lease_rows as ("));
    expect(block).toContain("'completed'");
    expect(block.toLowerCase()).toContain("paid");
  });

  it("marks past-due payments as overdue", () => {
    const block = sql.slice(sql.indexOf("payment_rows as ("), sql.indexOf("lease_rows as ("));
    expect(block).toContain("'overdue'");
    expect(block).toContain("current_date");
  });

  it("marks payments due within 7 days as due_soon", () => {
    const block = sql.slice(sql.indexOf("payment_rows as ("), sql.indexOf("lease_rows as ("));
    expect(block).toContain("'due_soon'");
    expect(block).toContain("current_date + 7");
  });

  it("marks renewed and ended leases as completed", () => {
    const block = sql.slice(sql.indexOf("lease_rows as ("), sql.indexOf("compliance_rows as ("));
    expect(block).toContain("renewed");
    expect(block).toContain("ended");
    expect(block).toContain("'completed'");
  });

  it("marks expired leases (past end date) as overdue", () => {
    const block = sql.slice(sql.indexOf("lease_rows as ("), sql.indexOf("compliance_rows as ("));
    expect(block).toContain("'overdue'");
    expect(block).toContain("current_date");
  });

  it("marks blocked maintenance requests as blocked", () => {
    const block = sql.slice(sql.indexOf("maintenance_rows as ("), sql.indexOf("work_order_rows as ("));
    expect(block).toContain("'blocked'");
    expect(block.toLowerCase()).toContain("blocked");
  });

  it("marks resolved maintenance requests as completed", () => {
    const block = sql.slice(sql.indexOf("maintenance_rows as ("), sql.indexOf("work_order_rows as ("));
    expect(block).toContain("'resolved'");
    expect(block).toContain("'completed'");
  });

  it("marks paused preventive tasks as blocked", () => {
    const block = sql.slice(sql.indexOf("preventive_rows as ("), sql.indexOf("custom_rows as ("));
    expect(block).toContain("paused");
    expect(block).toContain("'blocked'");
  });

  it("marks overdue preventive tasks as overdue", () => {
    const block = sql.slice(sql.indexOf("preventive_rows as ("), sql.indexOf("custom_rows as ("));
    expect(block).toContain("'overdue'");
    expect(block).toContain("current_date");
  });
});

// ─── SQL: urgency derivation includes critical tier ───────────────────────────

describe("get_operating_calendar RPC — urgency derivation", () => {
  it("assigns critical urgency for severely overdue payments", () => {
    const block = sql.slice(sql.indexOf("payment_rows as ("), sql.indexOf("lease_rows as ("));
    expect(block).toContain("'critical'");
    expect(block).toContain("- 30");
  });

  it("assigns critical urgency for expired leases", () => {
    const block = sql.slice(sql.indexOf("lease_rows as ("), sql.indexOf("compliance_rows as ("));
    expect(block).toContain("'critical'");
  });

  it("assigns critical urgency for urgent unresolved maintenance", () => {
    const block = sql.slice(sql.indexOf("maintenance_rows as ("), sql.indexOf("work_order_rows as ("));
    expect(block).toContain("'critical'");
    expect(block).toContain("'urgent'");
  });

  it("assigns critical urgency for severely overdue work order acknowledgements", () => {
    const block = sql.slice(sql.indexOf("work_order_rows as ("), sql.indexOf("preventive_rows as ("));
    expect(block).toContain("'critical'");
    expect(block).toContain("3 days");
  });
});

// ─── Service layer contracts ───────────────────────────────────────────────────

describe("operatingCalendarService", () => {
  it("calls get_operating_calendar RPC", () => {
    expect(service).toContain('"get_operating_calendar"');
  });

  it("maps all 7 RPC parameters", () => {
    expect(service).toContain("p_account_id");
    expect(service).toContain("p_start_date");
    expect(service).toContain("p_end_date");
    expect(service).toContain("p_property_id");
    expect(service).toContain("p_source_module");
    expect(service).toContain("p_urgency");
    expect(service).toContain("p_status");
  });

  it("exports getOperatingCalendar", () => {
    expect(service).toContain("export async function getOperatingCalendar");
  });

  it("exports createCalendarItem for custom tasks", () => {
    expect(service).toContain("export async function createCalendarItem");
  });

  it("exports updateCalendarItem", () => {
    expect(service).toContain("export async function updateCalendarItem");
  });

  it("exports deleteCalendarItem", () => {
    expect(service).toContain("export async function deleteCalendarItem");
  });

  it("creates custom items in operating_calendar_items table", () => {
    expect(service).toContain('"operating_calendar_items"');
  });

  it("throws on RPC error rather than silently returning null", () => {
    expect(service).toContain("if (error) throw error");
  });
});

// ─── Hook contracts ───────────────────────────────────────────────────────────

describe("useOperatingCalendar hook", () => {
  it("imports getOperatingCalendar from the service", () => {
    expect(hook).toContain("import");
    expect(hook).toContain("getOperatingCalendar");
    expect(hook).toContain("operatingCalendarService");
  });

  it("exports useOperatingCalendar", () => {
    expect(hook).toContain("export function useOperatingCalendar");
  });

  it("accepts all filter parameters", () => {
    expect(hook).toContain("startDate");
    expect(hook).toContain("endDate");
    expect(hook).toContain("propertyId");
    expect(hook).toContain("sourceModule");
    expect(hook).toContain("urgency");
    expect(hook).toContain("status");
  });

  it("returns items, loading, error, and refetch", () => {
    expect(hook).toContain("items");
    expect(hook).toContain("loading");
    expect(hook).toContain("error");
    expect(hook).toContain("refetch");
  });

  it("reads activeAccountId from AccountContext", () => {
    expect(hook).toContain("activeAccountId");
    expect(hook).toContain("useAccount");
  });

  it("guards against missing startDate or endDate", () => {
    expect(hook).toContain("!startDate");
    expect(hook).toContain("!endDate");
  });
});

// ─── Page contracts ───────────────────────────────────────────────────────────

describe("OperatingCalendarPage", () => {
  it("renders both Agenda and Month view toggles", () => {
    expect(page).toContain("Agenda");
    expect(page).toContain("Month");
  });

  it("imports AgendaView", () => {
    expect(page).toContain("AgendaView");
  });

  it("imports MonthView", () => {
    expect(page).toContain("MonthView");
  });

  it("imports CalendarFilters", () => {
    expect(page).toContain("CalendarFilters");
  });

  it("imports useOperatingCalendar hook", () => {
    expect(page).toContain("useOperatingCalendar");
  });

  it("implements prev/next month navigation", () => {
    expect(page).toContain("prevMonth");
    expect(page).toContain("nextMonth");
  });

  it("has a Today button to jump back to current month", () => {
    expect(page).toContain("goToToday");
    expect(page).toContain("Today");
  });

  it("shows a summary bar with status counts", () => {
    expect(page).toContain("SummaryBar");
  });

  it("shows skeleton loading state", () => {
    expect(page).toContain("Skeleton");
    expect(page).toContain("loading");
  });

  it("shows empty state via OnboardingHintCard", () => {
    expect(page).toContain("OnboardingHintCard");
  });

  it("has a Refresh button", () => {
    expect(page).toContain("RefreshCw");
    expect(page).toContain("refetch");
  });
});

// ─── Route registration ───────────────────────────────────────────────────────

describe("OperatingCalendarPage — route registration", () => {
  it("is lazy-loaded in ManagerRoutes", () => {
    expect(routes).toContain("OperatingCalendarPage");
    expect(routes).toContain("import(\"../pages/OperatingCalendarPage\")");
  });

  it("is registered at /operating-calendar", () => {
    expect(routes).toContain('path="operating-calendar"');
  });

  it("is wrapped in ManagerOnlyRoute", () => {
    const block = routes.slice(routes.indexOf("operating-calendar"));
    expect(block).toContain("ManagerOnlyRoute");
  });
});

// ─── Sidebar registration ─────────────────────────────────────────────────────

describe("OperatingCalendarPage — sidebar registration", () => {
  it("imports CalendarDays icon from lucide-react", () => {
    expect(sidebar).toContain("CalendarDays");
  });

  it("has a sidebar link to /operating-calendar", () => {
    expect(sidebar).toContain('"/operating-calendar"');
  });

  it("sidebar link is in the Operations section", () => {
    const opStart = sidebar.indexOf("sidebar.section.operations");
    const calendarLink = sidebar.indexOf('"/operating-calendar"');
    expect(opStart).toBeGreaterThan(-1);
    expect(calendarLink).toBeGreaterThan(opStart);
  });

  it("sidebar link label is Operating Calendar", () => {
    const block = sidebar.slice(sidebar.indexOf('"/operating-calendar"') - 200, sidebar.indexOf('"/operating-calendar"') + 200);
    expect(block).toContain("Operating Calendar");
  });
});

// ─── DB apply script ──────────────────────────────────────────────────────────

describe("operating_calendar.sql — dbApplyRepoSql registration", () => {
  it("is listed in OVERLAY_SEQUENCE", () => {
    expect(dbApply).toContain('"operating_calendar.sql"');
  });

  it("appears after the Poland compliance files in OVERLAY_SEQUENCE", () => {
    const polandIdx   = dbApply.indexOf('"poland_advanced_features.sql"');
    const calendarIdx = dbApply.indexOf('"operating_calendar.sql"');
    expect(polandIdx).toBeGreaterThan(-1);
    expect(calendarIdx).toBeGreaterThan(polandIdx);
  });
});
