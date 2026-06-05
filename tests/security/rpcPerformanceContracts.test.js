import { readFileSync } from "node:fs";

function readSql(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function normalizeSqlForContract(sql) {
  return sql.replace(/"([^"]+)"/g, "$1");
}

describe("RPC performance contracts", () => {
  it("keeps the highest-fan-in feed RPCs behind hard item caps", () => {
    const commandCenterSql = readSql("supabase/command_center_items.sql");
    const attentionCenterSql = readSql("supabase/attention_center_items.sql");
    const portfolioAttentionSql = readSql("supabase/portfolio_attention_items.sql");

    expect(commandCenterSql).toContain("greatest(1, least(coalesce(p_limit, 80), 200))");
    expect(attentionCenterSql).toContain("greatest(1, least(coalesce(p_limit, 60), 200))");
    expect(portfolioAttentionSql).toContain("greatest(1, least(coalesce(p_limit, 10), 50))");
  });

  it("keeps command center and attention center in the current branch-capped union shape", () => {
    const commandCenterSql = readSql("supabase/command_center_items.sql");
    const attentionCenterSql = readSql("supabase/attention_center_items.sql");

    expect(commandCenterSql).toContain("limited_request_items as (");
    expect(commandCenterSql).toContain("limited_work_order_items as (");
    expect(commandCenterSql).toContain("limited_lease_items as (");
    expect(commandCenterSql).toContain("limited_preventive_items as (");
    expect(commandCenterSql).toContain("limited_compliance_items as (");
    expect(commandCenterSql).toContain("limited_notification_items as (");
    expect(commandCenterSql).toContain("limited_automation_items as (");
    expect(commandCenterSql).toContain("limited_security_alert_items as (");
    expect(commandCenterSql).toContain("select * from limited_payment_items");
    expect(commandCenterSql).toContain("union all select * from limited_request_items");
    expect(commandCenterSql).toContain("union all select * from limited_work_order_items");
    expect(commandCenterSql).toContain("union all select * from limited_lease_items");
    expect(commandCenterSql).toContain("union all select * from limited_preventive_items");
    expect(commandCenterSql).toContain("union all select * from limited_compliance_items");
    expect(commandCenterSql).toContain("union all select * from limited_notification_items");
    expect(commandCenterSql).toContain("union all select * from limited_automation_items");
    expect(commandCenterSql).toContain("union all select * from limited_security_alert_items");

    expect(attentionCenterSql).toContain("limited_request_items as (");
    expect(attentionCenterSql).toContain("limited_work_order_items as (");
    expect(attentionCenterSql).toContain("limited_lease_items as (");
    expect(attentionCenterSql).toContain("limited_preventive_items as (");
    expect(attentionCenterSql).toContain("limited_compliance_items as (");
    expect(attentionCenterSql).toContain("limited_notification_items as (");
    expect(attentionCenterSql).toContain("select * from limited_payment_items");
    expect(attentionCenterSql).toContain("union all select * from limited_request_items");
    expect(attentionCenterSql).toContain("union all select * from limited_work_order_items");
    expect(attentionCenterSql).toContain("union all select * from limited_lease_items");
    expect(attentionCenterSql).toContain("union all select * from limited_preventive_items");
    expect(attentionCenterSql).toContain("union all select * from limited_compliance_items");
    expect(attentionCenterSql).toContain("union all select * from limited_notification_items");
  });

  it("keeps contractor card reads directly scoped to the authenticated contractor", () => {
    const contractorCardsSql = readSql("supabase/contractor_work_order_cards.sql");

    expect(contractorCardsSql).toContain("where wo.contractor_user_id = auth.uid()");
    expect(contractorCardsSql).toContain("wo.id = any(p_work_order_ids)");
  });

  it("retains the current supporting index definitions for the hottest account-scoped feed domains", () => {
    const baselineSchemaSql = normalizeSqlForContract(readSql("supabase/baseline_schema.sql"));
    const performanceIndexSql = readSql("supabase/performance_rpc_indexes.sql");

    expect(baselineSchemaSql).toContain("CREATE INDEX payments_account_tenant_due_idx ON public.payments USING btree (account_id, tenant_id, due_date DESC);");
    expect(baselineSchemaSql).toContain("CREATE INDEX maintenance_requests_account_property_idx ON public.maintenance_requests USING btree (account_id, property_id);");
    expect(baselineSchemaSql).toContain("CREATE INDEX work_orders_account_status_idx ON public.work_orders USING btree (account_id, status);");
    expect(baselineSchemaSql).toContain("CREATE INDEX work_orders_ack_due_idx ON public.work_orders USING btree (account_id, acknowledgement_due_at);");
    expect(baselineSchemaSql).toContain("CREATE INDEX idx_notifications_account_created ON public.notifications USING btree (account_id, created_at DESC);");
    expect(baselineSchemaSql).toContain("CREATE INDEX compliance_items_account_due_idx ON public.compliance_items USING btree (account_id, status, due_date);");
    expect(baselineSchemaSql).toContain("CREATE INDEX leases_account_id_idx ON public.leases USING btree (account_id);");
    expect(baselineSchemaSql).toContain("CREATE INDEX preventive_maintenance_tasks_account_idx ON public.preventive_maintenance_tasks USING btree (account_id);");

    expect(performanceIndexSql).toContain("create index if not exists work_orders_contractor_user_idx");
    expect(performanceIndexSql).toContain("create index if not exists payments_account_unpaid_due_idx");
    expect(performanceIndexSql).toContain("create index if not exists maintenance_requests_account_status_created_idx");
  });
});
