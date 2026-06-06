import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { getIntegrationAdminClient } from "../integration/helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { expectNoBlockingAccessibilityViolations } from "./helpers/accessibility.js";
import { seededUsers, signInAs } from "./helpers/auth.js";

const { accountA } = isolationFixtures.accounts;
const { tenantA1 }  = isolationFixtures.users;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateOffsetISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function currentMonthLabel() {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function nextMonthLabel() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function prevMonthLabel() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ─── Page shell and navigation ────────────────────────────────────────────────

test.describe("Operating Calendar — page shell", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("renders the page heading and view toggles", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Agenda" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Month", exact: true })).toBeVisible();
  });

  test("shows the current month label in the month navigator", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByText(currentMonthLabel())).toBeVisible({ timeout: 20_000 });
  });

  test("sidebar contains Operating Calendar link in the Operations section", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    // Sidebar nav link (excludes breadcrumbs)
    const calLink = page
      .locator('nav:not([aria-label="Breadcrumb"])')
      .getByRole("link", { name: "Operating Calendar" });

    await expect(calLink).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar link navigates to /operating-calendar", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/dashboard");

    await page
      .locator('nav:not([aria-label="Breadcrumb"])')
      .getByRole("link", { name: "Operating Calendar" })
      .click();

    await expect(page).toHaveURL(/\/operating-calendar(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
  });

  test("page has no blocking accessibility violations", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await expectNoBlockingAccessibilityViolations(page, "operating-calendar-page");
  });
});

// ─── Month navigation ─────────────────────────────────────────────────────────

test.describe("Operating Calendar — month navigation", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Next month button advances the month label", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByText(currentMonthLabel(), { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByText(nextMonthLabel(), { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("Previous month button goes back", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByText(prevMonthLabel(), { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("Today button returns to the current month from next month", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByText(nextMonthLabel(), { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByText(currentMonthLabel(), { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── View toggle ─────────────────────────────────────────────────────────────

test.describe("Operating Calendar — view toggle", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Agenda view is active by default", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    // Agenda button should be visually active (aria-pressed=true)
    const agendaBtn = page.getByRole("button", { name: "Agenda" });
    await expect(agendaBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("switching to Month view shows the day-of-week grid headers", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Month", exact: true }).click();

    // DOW header labels — exact: true avoids partial-matching agenda day headers like "Mon, 13 May"
    await expect(page.getByText("Mon", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Tue", { exact: true })).toBeVisible();
    await expect(page.getByText("Wed", { exact: true })).toBeVisible();
    await expect(page.getByText("Thu", { exact: true })).toBeVisible();
    await expect(page.getByText("Fri", { exact: true })).toBeVisible();
    await expect(page.getByText("Sat", { exact: true })).toBeVisible();
    await expect(page.getByText("Sun", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("switching back to Agenda from Month view restores Agenda", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await page.getByRole("button", { name: "Agenda" }).click();

    await expect(page.getByRole("button", { name: "Agenda" })).toHaveAttribute("aria-pressed", "true");
    // DOW header row should be gone — look for the exact "Mon" text in the grid header div
    await expect(page.locator("div").filter({ hasText: /^Mon$/ }).first()).toBeHidden({ timeout: 5_000 });
  });
});

// ─── Filter panel ─────────────────────────────────────────────────────────────

test.describe("Operating Calendar — filter panel", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Filters button opens the filter control panel", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    // Panel hidden initially
    await expect(page.getByLabel("Source module")).toBeHidden({ timeout: 5_000 });

    await page.getByRole("button", { name: "Filters" }).click();

    // All filter selects visible
    await expect(page.getByLabel("Source module", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Urgency", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Status", { exact: true })).toBeVisible();
  });

  test("source module filter options include all 7 modules", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByLabel("Source module")).toBeVisible({ timeout: 10_000 });

    const select = page.getByLabel("Source module", { exact: true });
    await expect(select.locator("option[value='payment']")).toHaveText("Rent");
    await expect(select.locator("option[value='lease']")).toHaveText("Lease");
    await expect(select.locator("option[value='compliance']")).toHaveText("Compliance");
    await expect(select.locator("option[value='maintenance']")).toHaveText("Maintenance");
    await expect(select.locator("option[value='work_order']")).toHaveText("Work orders");
    await expect(select.locator("option[value='preventive']")).toHaveText("Preventive");
    await expect(select.locator("option[value='custom']")).toHaveText("Custom");
  });

  test("status filter options cover all 5 statuses", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Filters" }).click();

    const select = page.getByLabel("Status", { exact: true });
    await expect(select.locator("option[value='overdue']")).toHaveText("Overdue");
    await expect(select.locator("option[value='due_soon']")).toHaveText("Due soon");
    await expect(select.locator("option[value='scheduled']")).toHaveText("Scheduled");
    await expect(select.locator("option[value='completed']")).toHaveText("Completed");
    await expect(select.locator("option[value='blocked']")).toHaveText("Blocked");
  });

  test("applying a source filter shows an active filter count badge", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Source module", { exact: true }).selectOption("payment");

    // Badge showing "1" active filter should appear inside the Filters button
    const filtersBtn = page.getByRole("button", { name: /Filters/ });
    await expect(filtersBtn.getByText("1")).toBeVisible({ timeout: 10_000 });
  });

  test("Clear all removes the active filter badge", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Source module", { exact: true }).selectOption("payment");

    await page.getByRole("button", { name: "Clear all" }).click();

    const filtersBtn = page.getByRole("button", { name: /Filters/ });
    await expect(filtersBtn.getByText("1")).toBeHidden({ timeout: 5_000 });
  });
});

// ─── Agenda view with live seed data ──────────────────────────────────────────

test.describe("Operating Calendar — agenda content", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  const admin = getIntegrationAdminClient();
  const createdIds = new Set();

  test.afterEach(async () => {
    if (createdIds.size === 0) return;
    await admin.from("operating_calendar_items").delete().in("id", Array.from(createdIds));
    createdIds.clear();
  });

  test("seeded payment from account A appears in agenda as a Rent item", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    // The harness seeds a payment for account A — title starts with "Rent:"
    await expect(page.getByText(/^Rent:/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("seeded maintenance request from account A appears in agenda", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    // CalendarItemCard shows a source module chip: "Maintenance"
    await expect(page.getByText("Maintenance").first()).toBeVisible({ timeout: 20_000 });
  });

  test("custom calendar item appears in agenda after admin seed", async ({ page }) => {
    const id    = randomUUID();
    const title = `E2E Calendar Task ${Date.now()}`;
    createdIds.add(id);

    const { error } = await admin.from("operating_calendar_items").insert({
      id,
      account_id: accountA.id,
      title,
      due_date:   todayISO(),
      urgency:    "high",
      status:     "scheduled",
    });
    expect(error).toBeNull();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
  });

  test("custom item due in the past is rendered with Overdue status badge", async ({ page }) => {
    const id    = randomUUID();
    const title = `E2E Overdue Task ${Date.now()}`;
    createdIds.add(id);

    // Use yesterday — always in the current month except on the 1st, and always < today.
    const { error } = await admin.from("operating_calendar_items").insert({
      id,
      account_id: accountA.id,
      title,
      due_date:   dateOffsetISO(-1),
      urgency:    "medium",
      status:     "scheduled",
    });
    expect(error).toBeNull();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    // Custom items render as a div (no <a> wrapper). Find the card via its border-l class.
    const card = page.locator('[class*="border-l-"]').filter({ hasText: title });
    await expect(card.getByText("Overdue", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("custom item status blocked renders Blocked badge", async ({ page }) => {
    const id    = randomUUID();
    const title = `E2E Blocked Task ${Date.now()}`;
    createdIds.add(id);

    const { error } = await admin.from("operating_calendar_items").insert({
      id,
      account_id: accountA.id,
      title,
      due_date:   todayISO(),
      urgency:    "high",
      status:     "blocked",
    });
    expect(error).toBeNull();

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    // Custom items render as a div (no <a> wrapper). Scope by the border-l class on the card.
    const card = page.locator('[class*="border-l-"]').filter({ hasText: title });
    await expect(card.getByText("Blocked", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("source module filter to 'payment' hides custom and maintenance items", async ({ page }) => {
    const id    = randomUUID();
    const title = `E2E Custom Filter Test ${Date.now()}`;
    createdIds.add(id);

    await admin.from("operating_calendar_items").insert({
      id,
      account_id: accountA.id,
      title,
      due_date:   todayISO(),
      urgency:    "low",
      status:     "scheduled",
    });

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    // Apply payment filter
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Source module", { exact: true }).selectOption("payment");

    // Custom item should disappear
    await expect(page.getByText(title)).toBeHidden({ timeout: 10_000 });
    // Rent items should still be visible
    await expect(page.getByText(/^Rent:/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("summary bar shows status chip counts above the agenda", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    // Summary bar shows at least one chip (seeded data always produces some)
    const summaryChips = page.locator('[aria-label="Month summary"] span');
    await expect(summaryChips.first()).toBeVisible({ timeout: 20_000 });
  });

  test("items group by date with day headers (Today / formatted date)", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    // AgendaView renders date headers — either "Today", "Tomorrow", or a day like "Mon 13 May 2026"
    const dateHeaders = page.locator("section[aria-label]");
    await expect(dateHeaders.first()).toBeVisible({ timeout: 20_000 });
  });
});

// ─── Month view with live seed data ───────────────────────────────────────────

test.describe("Operating Calendar — month view content", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  const admin = getIntegrationAdminClient();
  const createdIds = new Set();

  test.afterEach(async () => {
    if (createdIds.size === 0) return;
    await admin.from("operating_calendar_items").delete().in("id", Array.from(createdIds));
    createdIds.clear();
  });

  test("Month view grid renders day numbers and today is highlighted", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Month", exact: true }).click();

    const todayNum = new Date().getDate().toString();
    // The today cell has a highlighted day number — aria-label includes "item"
    const todayCell = page.getByRole("button", { name: new RegExp(`^${todayNum} —`) });
    await expect(todayCell).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a day with items shows item detail below the grid", async ({ page }) => {
    const id    = randomUUID();
    const title = `E2E Month Click Task ${Date.now()}`;
    createdIds.add(id);

    await admin.from("operating_calendar_items").insert({
      id,
      account_id: accountA.id,
      title,
      due_date:   todayISO(),
      urgency:    "medium",
      status:     "scheduled",
    });

    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Month", exact: true }).click();

    // Click on today's cell
    const todayNum = new Date().getDate().toString();
    const todayCell = page.getByRole("button", { name: new RegExp(`^${todayNum} —`) }).first();
    await expect(todayCell).toBeVisible({ timeout: 10_000 });
    await todayCell.click();

    // Detail panel renders the title
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test("clicking a day twice deselects it (detail panel hidden)", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Month", exact: true }).click();

    const todayNum = new Date().getDate().toString();
    const todayCell = page.getByRole("button", { name: new RegExp(`^${todayNum} —`) }).first();
    await expect(todayCell).toBeVisible({ timeout: 10_000 });

    await todayCell.click();
    // Detail section appears
    await expect(todayCell).toHaveAttribute("aria-pressed", "true");

    await todayCell.click();
    // Deselected
    await expect(todayCell).toHaveAttribute("aria-pressed", "false");
  });

  test("status dots appear in month grid cells that have items", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Month", exact: true }).click();

    // Status dots are rendered as spans with rounded-full — at least one should exist
    const dots = page.locator(".w-1\\.5.h-1\\.5.rounded-full");
    await expect(dots.first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Refresh button ───────────────────────────────────────────────────────────

test.describe("Operating Calendar — refresh", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("Refresh button reloads without error", async ({ page }) => {
    await signInAs(page, seededUsers.ownerA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Refresh calendar" }).click();

    // After refresh the heading is still visible (no crash)
    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 15_000 });
    // No error panel
    await expect(page.getByText("Failed to load calendar data")).toBeHidden({ timeout: 5_000 });
  });
});

// ─── Role-based access ────────────────────────────────────────────────────────

test.describe("Operating Calendar — role access control", () => {
  test.skip(!isIntegrationHarnessConfigured(), "requires local Supabase harness");

  test("admin can access operating-calendar", async ({ page }) => {
    await signInAs(page, seededUsers.adminA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
  });

  test("staff can access operating-calendar", async ({ page }) => {
    await signInAs(page, seededUsers.staffA);
    await page.goto("/operating-calendar");

    await expect(page.getByRole("heading", { name: "Operating Calendar" })).toBeVisible({ timeout: 20_000 });
  });

  test("tenant is redirected away from /operating-calendar", async ({ page }) => {
    await signInAs(page, seededUsers.tenantA1);
    await page.goto("/operating-calendar");

    await expect(page).not.toHaveURL(/\/operating-calendar/, { timeout: 10_000 });
    // Tenant lands on their home or dashboard — not the calendar
    await expect(page).toHaveURL(/\/tenant\/home|\/dashboard/, { timeout: 10_000 });
  });

  test("contractor is redirected away from /operating-calendar", async ({ page }) => {
    await signInAs(page, seededUsers.contractorA1);
    await page.goto("/operating-calendar");

    await expect(page).not.toHaveURL(/\/operating-calendar/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/contractor|\/dashboard/, { timeout: 10_000 });
  });
});
