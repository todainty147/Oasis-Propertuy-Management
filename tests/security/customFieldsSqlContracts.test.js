import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("custom fields SQL contracts", () => {
  it("keeps the custom fields overlay in bootstrap and repo replay order", () => {
    const bootstrapSource = readSource("scripts/dbBootstrap.js");
    const applySource = readSource("scripts/dbApplyRepoSql.js");

    expect(bootstrapSource).toContain("custom_fields.sql");
    expect(applySource).toContain('"custom_fields.sql"');
  });

  it("defines relational custom field definitions and values for property and tenant entities", () => {
    const sql = readSource("supabase/custom_fields.sql");

    expect(sql).toContain("create table if not exists public.custom_field_definitions");
    expect(sql).toContain("create table if not exists public.custom_field_values");
    expect(sql).toContain("entity_type text not null");
    expect(sql).toContain("field_type text not null");
    expect(sql).toContain("check (lower(trim(entity_type)) in ('property', 'tenant'))");
    expect(sql).toContain("check (lower(trim(field_type)) in ('text', 'number', 'date'))");
    expect(sql).toContain("references public.custom_field_definitions(id) on delete cascade");
    expect(sql).toContain("unique (definition_id, entity_id)");
  });

  it("validates value column shape and entity/account scope through a trigger", () => {
    const sql = readSource("supabase/custom_fields.sql");

    expect(sql).toContain("create or replace function public.validate_custom_field_value()");
    expect(sql).toContain("Exactly one custom field value column must be populated");
    expect(sql).toContain("Text custom fields must use text_value only");
    expect(sql).toContain("Number custom fields must use number_value only");
    expect(sql).toContain("Date custom fields must use date_value only");
    expect(sql).toContain("Custom field entity must be an in-scope property");
    expect(sql).toContain("Custom field entity must be an in-scope tenant");
    expect(sql).toContain("create trigger trg_validate_custom_field_value");
  });

  it("keeps custom fields manager-scoped via user_can_manage_account", () => {
    const sql = readSource("supabase/custom_fields.sql");

    expect(sql).toContain("custom_field_definitions_select_managers");
    expect(sql).toContain("custom_field_definitions_write_managers");
    expect(sql).toContain("custom_field_values_select_managers");
    expect(sql).toContain("custom_field_values_write_managers");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
  });
});
