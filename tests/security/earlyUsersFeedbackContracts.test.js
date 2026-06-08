import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("early users and feedback contracts", () => {
  it("ships the database surface with RLS and root-only admin RPCs", () => {
    const sql = read("supabase/early_users_feedback.sql");

    [
      "create table if not exists public.user_profiles",
      "create table if not exists public.signup_intelligence",
      "create table if not exists public.user_contact_preferences",
      "create table if not exists public.user_feedback_requests",
      "create table if not exists public.user_activation_events",
      "create or replace function public.record_signup_intelligence",
      "create or replace function public.record_user_activation_event",
      "create or replace function public.early_users_admin_list",
      "create or replace function public.update_feedback_status",
      "create or replace function public.early_user_detail",
    ].forEach((expected) => expect(sql).toContain(expected));

    expect(sql).toContain("alter table public.signup_intelligence enable row level security");
    expect(sql).toContain("alter table public.user_activation_events enable row level security");
    expect(sql).toContain("if not public.user_is_root_operator() then");
    expect(sql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(sql).toContain("user_activation_events_first_event_uidx");
  });

  it("is included in the curated SQL apply order after founder offer schema", () => {
    const source = read("scripts/dbApplyRepoSql.js");
    const founderIndex = source.indexOf('"founder_launch_offer.sql"');
    const earlyUsersIndex = source.indexOf('"early_users_feedback.sql"');

    expect(earlyUsersIndex).toBeGreaterThan(founderIndex);
  });

  it("captures signup consent without pre-ticking optional feedback choices", () => {
    const source = read("src/pages/LandlordSignup.jsx");

    expect(source).toContain("const [feedbackContactOptIn, setFeedbackContactOptIn] = useState(false);");
    expect(source).toContain("const [productUpdatesOptIn, setProductUpdatesOptIn] = useState(false);");
    expect(source).toContain("recordSignupIntelligence({");
    expect(source).toContain("feedbackOptIn: feedbackContactOptIn");
    expect(source).toContain("productUpdatesOptIn");
    expect(source).toContain("console.warn(\"[early-users] signup intelligence capture failed\"");
    expect(source).toContain("eventKey: \"founder_offer_applied\"");

    const service = read("src/services/earlyUsersService.js");
    expect(service).toContain("p_feedback_contact_opt_in: Boolean(feedbackOptIn)");
    expect(service).not.toContain("p_feedback_opt_in");
  });

  it("records activation milestones from successful create flows", () => {
    const expectations = [
      ["src/services/propertyService.js", "first_property_created"],
      ["src/services/tenantService.js", "first_tenant_created"],
      ["src/services/documentService.js", "first_document_uploaded"],
      ["src/services/maintenanceService.js", "first_maintenance_request_created"],
      ["src/services/workOrderService.js", "first_work_order_created"],
      ["src/services/paymentService.js", "first_rent_record_added"],
    ];

    expectations.forEach(([file, eventKey]) => {
      const source = read(file);
      expect(source).toContain("recordActivationEventBestEffort");
      expect(source).toContain(eventKey);
    });
  });

  it("exposes a root-only admin page and navigation entry", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    const sidebar = read("src/layout/Sidebar.jsx");
    const page = read("src/pages/admin/EarlyUsersPage.jsx");
    const service = read("src/services/earlyUsersService.js");

    expect(routes).toContain("EarlyUsersPage");
    expect(routes).toContain('path="root/early-users"');
    expect(routes).toContain("ENTITLEMENT_FEATURES.ROOT_TELEMETRY");
    expect(sidebar).toContain('to="/root/early-users"');
    expect(page).toContain("listEarlyUsers");
    expect(page).toContain("updateFeedbackStatus");
    expect(service).toContain('supabase.rpc("early_users_admin_list"');
    expect(service).toContain('supabase.rpc("update_feedback_status"');
  });
});
