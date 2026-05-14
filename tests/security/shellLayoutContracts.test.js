import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const topbar     = read("src/layout/Topbar.jsx");
const appLayout  = read("src/layout/AppLayout.jsx");
const card       = read("src/components/Card.jsx");
const bottomNav  = read("src/components/mobile/MobileBottomNav.jsx");

// ─── Topbar ──────────────────────────────────────────────────────────────────

describe("Topbar", () => {
  it("is not fixed-position (flex child, not fixed)", () => {
    expect(topbar).not.toMatch(/position.*fixed|fixed\s+top-0|fixed\s+inset/);
    expect(topbar).toMatch(/shrink-0/);
  });

  it("uses h-11 height token matching Apple HIG 44px toolbar", () => {
    expect(topbar).toMatch(/h-11/);
  });

  it("uses frosted-glass border token", () => {
    expect(topbar).toMatch(/border-black\/\[0\.06\]/);
  });

  it("exposes avatar with Open user menu aria-label", () => {
    expect(topbar).toMatch(/aria-label="Open user menu"/);
  });

  it("logout is inside UserMenu popover, not a top-level button", () => {
    // Logout button must be inside the popover JSX block (within the open && ... block)
    const popoverStart = topbar.indexOf("{open && (");
    expect(popoverStart).toBeGreaterThan(-1);
    const logoutIdx = topbar.indexOf("topbar.logout");
    expect(logoutIdx).toBeGreaterThan(popoverStart);
  });

  it("has no inline theme segmented control outside UserMenu", () => {
    // Theme/language controls live inside the UserMenu function, not duplicated in Topbar
    const topbarFnStart = topbar.indexOf("export default function Topbar");
    const themeAfterTopbarExport = topbar.indexOf("setTheme", topbarFnStart);
    expect(themeAfterTopbarExport).toBe(-1);
  });

  it("has no inline language control outside UserMenu", () => {
    const topbarFnStart = topbar.indexOf("export default function Topbar");
    const langAfterTopbarExport = topbar.indexOf("setLang", topbarFnStart);
    expect(langAfterTopbarExport).toBe(-1);
  });

  it("shows page title from PageTitleContext", () => {
    expect(topbar).toMatch(/usePageTitle/);
    expect(topbar).toMatch(/\{title\}/);
  });

  it("includes NotificationsBell", () => {
    expect(topbar).toMatch(/NotificationsBell/);
  });
});

// ─── AppLayout ───────────────────────────────────────────────────────────────

describe("AppLayout", () => {
  it("uses two-surface bg-[#F5F5F7] / bg-[#1C1C1E] outer shell", () => {
    expect(appLayout).toMatch(/bg-\[#F5F5F7\]/);
    expect(appLayout).toMatch(/bg-\[#1C1C1E\]/);
  });

  it("right column is bg-white / bg-slate-900 (content surface)", () => {
    expect(appLayout).toMatch(/bg-white.*bg-slate-900|bg-slate-900.*bg-white/);
  });

  it("main has padding-bottom clearing mobile nav (pb-[72px])", () => {
    expect(appLayout).toMatch(/pb-\[72px\]/);
  });

  it("main has no fixed-topbar compensating padding-top (no pt-14 or pt-16)", () => {
    expect(appLayout).not.toMatch(/pt-14|pt-16/);
  });

  it("includes MobileBottomNav", () => {
    expect(appLayout).toMatch(/MobileBottomNav/);
  });

  it("overflow-hidden on outer div prevents double scrollbars", () => {
    expect(appLayout).toMatch(/overflow-hidden/);
  });

  it("main is overflow-y-auto (only main scrolls)", () => {
    expect(appLayout).toMatch(/overflow-y-auto/);
  });
});

// ─── Card ─────────────────────────────────────────────────────────────────────

describe("Card", () => {
  it("has no shadow (Apple HIG: no hover-lift on cards)", () => {
    expect(card).not.toMatch(/shadow-sm|shadow-md|shadow-lg|shadow-xl/);
  });

  it("has no translate / hover-lift animation", () => {
    expect(card).not.toMatch(/translate|hover:-translate|transition-transform/);
  });

  it("uses border-black opacity token instead of hard border-slate", () => {
    expect(card).toMatch(/border-black\/\[0\.07\]/);
    expect(card).not.toMatch(/border-slate-200/);
  });

  it("uses rounded-xl corner radius", () => {
    expect(card).toMatch(/rounded-xl/);
  });

  it("is a forwardRef component for composition", () => {
    expect(card).toMatch(/forwardRef/);
  });
});

// ─── MobileBottomNav ─────────────────────────────────────────────────────────

describe("MobileBottomNav", () => {
  it("is hidden above lg breakpoint (lg:hidden)", () => {
    expect(bottomNav).toMatch(/lg:hidden/);
  });

  it("uses frosted-glass background matching sidebar tint", () => {
    expect(bottomNav).toMatch(/bg-\[#F5F5F7\]\/95/);
    expect(bottomNav).toMatch(/backdrop-blur/);
  });

  it("uses border-black opacity token consistent with shell", () => {
    expect(bottomNav).toMatch(/border-black\/\[0\.06\]/);
  });

  it("respects iOS safe-area-inset-bottom", () => {
    expect(bottomNav).toMatch(/safe-area-inset-bottom/);
  });

  it("uses strokeWidth 1.7 matching sidebar icon weight", () => {
    expect(bottomNav).toMatch(/strokeWidth=\{1\.7\}/);
  });

  it("is role-aware: renders tenant nav for tenant role", () => {
    expect(bottomNav).toMatch(/role.*===.*tenant|tenant.*role/);
    expect(bottomNav).toMatch(/\/tenant\/home/);
  });

  it("renders Privacy nav item for all roles", () => {
    const privacyMatches = (bottomNav.match(/Privacy/g) || []).length;
    expect(privacyMatches).toBeGreaterThanOrEqual(3);
  });

  it("shows unread badge on Command item for owner/admin/staff", () => {
    expect(bottomNav).toMatch(/unreadCount/);
    expect(bottomNav).toMatch(/badge=\{unreadCount\}/);
  });
});
