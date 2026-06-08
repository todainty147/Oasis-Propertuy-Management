import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("preferred supplier intelligence contracts", () => {
  it("ships a private account-scoped preferred supplier schema and audited RPC surface", () => {
    const sql = read("supabase/contractor_preferred_supplier_intelligence.sql");

    expect(sql).toContain("create table if not exists public.contractor_preferred_suppliers");
    expect(sql).toContain("constraint contractor_preferred_suppliers_unique unique (account_id, contractor_id)");
    expect(sql).toContain("alter table public.contractor_preferred_suppliers enable row level security");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).toContain("revoke all on public.contractor_preferred_suppliers from anon");
    expect(sql).toContain("revoke all on public.contractor_preferred_suppliers from authenticated");
    expect(sql).toContain("grant select on public.contractor_preferred_suppliers to authenticated");
    expect(sql).not.toContain("grant select, insert");
    expect(sql).not.toContain("grant select, update");

    expect(sql).toContain("create or replace function public.set_contractor_preferred_supplier");
    expect(sql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(sql).toContain("and c.account_id = p_account_id");
    expect(sql).toContain("preferred_supplier_marked");
    expect(sql).toContain("preferred_supplier_removed");
    expect(sql).toContain("create or replace function public.contractor_preferred_suppliers_set_updated_at()");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("exception when others then");
  });

  it("summarizes and recommends contractors without cross-account marketplace data", () => {
    const sql = read("supabase/contractor_preferred_supplier_intelligence.sql");

    expect(sql).toContain("create or replace function public.contractor_performance_summary");
    expect(sql).toContain("create or replace function public.recommended_contractors_for_work_order");
    expect(sql).toContain("where c.account_id = p_account_id");
    expect(sql).toContain("on wo.account_id = c.account_id");
    expect(sql).toContain("wo.contractor_id = c.id");
    expect(sql).toContain("wo.contractor_id is null and wo.contractor_user_id = c.user_id");
    expect(sql).toContain("on cr.account_id = c.account_id");
    expect(sql).toContain("and fin.account_id = wo.account_id");
    expect(sql).toContain("array[]::text[] as common_job_categories");
    expect(sql).not.toContain("mr.priority");
    expect(sql).not.toContain("s.phone");
    expect(sql).not.toContain("s.email");
    expect(sql).toContain("case when b.preferred then 0 else 40 end");
    expect(sql).toContain("case when coalesce(ws.used_at_property, false) then 0 else 10 end");
    expect(sql).toContain("case when coalesce(rs.average_rating, 0) >= 4 then 0 else 20 end");
    expect(sql).toContain("case when ws.last_used_at is not null and ws.last_used_at >= now() - interval '180 days' then 0 else 30 end");
    expect(sql).toContain("order by recommendation_rank asc, lower(b.name) asc, b.contractor_id asc");
    expect(sql).toContain("order by s.recommendation_rank asc, lower(s.name) asc, s.contractor_id asc");
    expect(sql).toContain("recommendation_reasons");
    expect(sql).not.toContain("marketplace");
  });

  it("denies tenant and contractor roles through manager-only RPC guards", () => {
    const sql = read("supabase/contractor_preferred_supplier_intelligence.sql");
    const directoryService = read("src/services/contractorDirectoryService.js");
    const workOrderService = read("src/services/workOrderService.js");

    expect(sql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(sql).toContain("grant execute on function public.set_contractor_preferred_supplier(uuid, uuid, boolean, text) to authenticated");
    expect(sql).toContain("revoke all on public.contractor_preferred_suppliers from authenticated");
    expect(sql).toContain("grant select on public.contractor_preferred_suppliers to authenticated");
    expect(sql).not.toContain("grant insert");
    expect(sql).not.toContain("grant update");
    expect(sql).not.toContain("auth.uid() = v_contractor.user_id");

    expect(directoryService).toContain('supabase.rpc("set_contractor_preferred_supplier"');
    expect(workOrderService).toContain("return rows.filter((contractor) => contractor.active !== false);");
  });

  it("is included in repository SQL apply order after contractor ratings", () => {
    const source = read("scripts/dbApplyRepoSql.js");
    const ratingsIndex = source.indexOf('"contractor_ratings.sql"');
    const preferredIndex = source.indexOf('"contractor_preferred_supplier_intelligence.sql"');

    expect(ratingsIndex).toBeGreaterThan(-1);
    expect(preferredIndex).toBeGreaterThan(ratingsIndex);
  });

  it("keeps contractor ratings idempotent and auditable", () => {
    const ratingsSql = read("supabase/contractor_ratings.sql");
    const service = read("src/services/contractorRatingService.js");

    expect(ratingsSql).toContain("work_order_id uuid not null references public.work_orders(id) on delete cascade");
    expect(ratingsSql).toContain("unique (work_order_id)");
    expect(service).toContain('.upsert(payload, { onConflict: "work_order_id" })');
    expect(service).toContain("contractor_rating_submitted");
    expect(service).toContain("contractor_rating_updated");
    expect(service).toContain('supabase.rpc("log_security_event"');
  });

  it("wires account-local supplier intelligence through services and work-order flows", () => {
    const directoryService = read("src/services/contractorDirectoryService.js");
    const workOrderService = read("src/services/workOrderService.js");
    const detailsPage = read("src/pages/WorkOrderDetails.jsx");
    const drawer = read("src/components/maintenance-inbox/CreateWorkOrderDrawer.jsx");
    const workOrdersSection = read("src/components/WorkOrdersSection.jsx");

    expect(directoryService).toContain("listContractorPerformanceSummary");
    expect(directoryService).toContain('supabase.rpc("contractor_performance_summary"');
    expect(directoryService).toContain("listRecommendedContractors");
    expect(directoryService).toContain('supabase.rpc("recommended_contractors_for_work_order"');
    expect(directoryService).toContain("setContractorPreferredSupplier");
    expect(directoryService).toContain('supabase.rpc("set_contractor_preferred_supplier"');
    expect(directoryService).toContain('labels.push("Preferred")');
    expect(directoryService).toContain('labels.push("Highly rated")');
    expect(directoryService).toContain("180 * 24 * 60 * 60 * 1000");
    expect(directoryService).toContain('labels.push("Recently used")');
    expect(directoryService).toContain('labels.push("Used at this property")');

    expect(workOrderService).toContain("listContractorPerformanceSummary");
    expect(workOrderService).toContain("return rows.filter((contractor) => contractor.active !== false);");

    [detailsPage, workOrdersSection].forEach((source) => {
      expect(source).toContain("Recommended contractors");
      expect(source).toContain("Preferred");
      expect(source).toContain("averageRating");
    });

    expect(detailsPage).toContain("listRecommendedContractors");
    expect(detailsPage).toContain("setContractorPreferredSupplier");
    expect(detailsPage).toContain("preferredSuggestion.name");
    expect(detailsPage).toContain("Mark preferred");
    expect(detailsPage).not.toContain("window.confirm");
    expect(drawer).toContain("listRecommendedContractors");
    expect(drawer).toContain("Recommended from this account");
    expect(drawer).toContain("Preferred");
    expect(drawer).toContain("averageRating");
    expect(workOrdersSection).toContain("setContractorPreferredSupplier");
    expect(workOrdersSection).toContain("preferredSuggestion.name");
    expect(workOrdersSection).toContain("Mark preferred");
    expect(workOrdersSection).not.toContain("window.confirm");
  });
});
