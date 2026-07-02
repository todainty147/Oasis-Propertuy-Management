import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildConditionComparisonRows,
  compareInspectionReports,
} from "../../src/lib/depositDisputePack";

const root = path.resolve(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ---------------------------------------------------------------------------
// E-077 — Maintenance evidence strength contracts
// ---------------------------------------------------------------------------

describe("E-077: Work order evidence lock — SQL contracts", () => {
  it("repair SQL adds attester_role column with valid-role check constraint", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("add column if not exists attester_role text");
    expect(sql).toContain("'contractor'");
    expect(sql).toContain("'landlord'");
    expect(sql).toContain("'tenant'");
    expect(sql).toContain("'admin'");
    expect(sql).toContain("'system'");
  });

  it("woa_delete policy adds completion-status check on uploader arm — not at upload", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    // Policy drops and recreates woa_delete with the completion gate
    expect(sql).toContain('drop policy if exists "woa_delete"');
    expect(sql).toContain('create policy "woa_delete"');
    // Uploader arm must check WO status
    expect(sql).toContain("uploaded_by = auth.uid()");
    expect(sql).toContain("wo.status not in");
    expect(sql).toContain("'completed'");
    expect(sql).toContain("'cancelled'");
  });

  it("drops legacy policy families and keeps only canonical woa_* policies (E-159)", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain('drop policy if exists "wo_attach_read"');
    expect(sql).toContain('drop policy if exists "wo_attach_insert"');
    expect(sql).toContain('drop policy if exists "wo_attach_delete"');
    expect(sql).toContain('drop policy if exists "wo_attachments_select"');
    expect(sql).toContain('drop policy if exists "wo_attachments_insert"');
    expect(sql).toContain('drop policy if exists "wo_attachments_delete"');
    expect(sql).toContain('create policy "woa_select"');
    expect(sql).toContain('create policy "woa_insert"');
    expect(sql).toContain('create policy "woa_delete"');
  });

  it("owner/admin/staff arm is preserved in canonical delete policy (data-correction path)", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    const occurrences = (sql.match(/lower\(am\.role::text\) = any/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(1);
    expect(sql).toContain("'owner', 'admin', 'staff'");
  });

  it("canonical work-order access helper preserves assigned contractor reads", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("create or replace function public.can_access_work_order");
    expect(sql).toContain("wo.contractor_user_id = auth.uid()");
    expect(sql).toContain("public.is_tenant_for_work_order(p_work_order_id)");
  });
});

describe("E-077: Work order evidence lock — service layer contracts", () => {
  it("uploadWorkOrderAttachments accepts attesterRole/stage/capture metadata and uses recorder RPC", () => {
    const svc = read("src/services/workOrderAttachmentsService.js");
    expect(svc).toContain("attesterRole = null");
    expect(svc).toContain("maintenanceStage = null");
    expect(svc).toContain('captureMethod = "uploaded"');
    expect(svc).toContain('supabase.rpc("record_work_order_attachment_received"');
    expect(svc).toContain("p_attester_role: attesterRole ?? null");
    expect(svc).toContain("p_maintenance_stage: maintenanceStage ?? null");
    expect(svc).toContain("p_capture_method: captureMethod || \"uploaded\"");
  });

  it("listWorkOrderAttachments selects attester_role from DB", () => {
    const svc = read("src/services/workOrderAttachmentsService.js");
    expect(svc).toContain("attester_role");
  });

  it("deleteWorkOrderAttachment does DB delete first and detects RLS denial via 0 rows", () => {
    const svc = read("src/services/workOrderAttachmentsService.js");
    // DB delete with .select('id') before storage remove
    expect(svc).toContain('.delete()');
    expect(svc).toContain(".select(\"id\")");
    expect(svc).toContain("deleted.length === 0");
  });

  it("deleteWorkOrderAttachment surfaces a lock error when row still exists after failed delete", () => {
    const svc = read("src/services/workOrderAttachmentsService.js");
    expect(svc).toContain("Evidence from a completed work order cannot be deleted");
    expect(svc).toContain("locked to maintain the integrity");
    expect(svc).toContain("Contact an account administrator");
  });

  it("deleteWorkOrderAttachment does NOT pre-flight-check WO status before attempting delete", () => {
    const svc = read("src/services/workOrderAttachmentsService.js");
    // There must be no status check before the delete call.
    // A pre-flight gate on WO status without role context would block
    // owner/admin data-correction, because the lock rule has a role dimension.
    const deleteIdx = svc.indexOf(".delete()");
    const statusCheckIdx = svc.indexOf("wo.status");
    // If there is a wo.status check, it must come AFTER the delete (in the catch path)
    // or not at all in the JS layer. It belongs only in the SQL policy.
    if (statusCheckIdx !== -1) {
      expect(statusCheckIdx).toBeGreaterThan(deleteIdx);
    }
  });
});

describe("E-150: Work-order contractor completion photo evidence contracts", () => {
  it("adds nullable evidence metadata fields without a misleading image_content_hash", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("add column if not exists maintenance_stage text");
    expect(sql).toContain("add column if not exists capture_method text");
    expect(sql).toContain("add column if not exists work_order_status_at_received text");
    expect(sql).toContain("add column if not exists late_upload boolean");
    expect(sql).toContain("add column if not exists content_hash_client_asserted text");
    expect(sql).toContain("add column if not exists content_hash_algorithm text");
    expect(sql).toContain("add column if not exists content_hash_verified_at timestamptz");
    expect(sql).toContain("add column if not exists provenance_event_id uuid");
    expect(sql).not.toContain("image_content_hash");
    expect(sql).not.toContain("photo_content_hash");
  });

  it("records DB row and photo.received provenance inside one RPC transaction", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    const fn = sql.match(/create or replace function public\.record_work_order_attachment_received[\s\S]*?\nend;\n\$\$;/)?.[0] || "";
    expect(fn).toContain("insert into public.work_order_attachments");
    expect(fn).toContain("public._append_evidence_provenance_event");
    expect(fn).toContain("'photo.received'");
    expect(fn).toContain("'work_order'");
    expect(fn).toContain("v_attachment.created_at");
    expect(fn).toContain("update public.work_order_attachments");
    expect(fn).toContain("set provenance_event_id = v_event_id");
  });

  it("prevents anchored rows/events for absent storage bytes", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    const fn = sql.match(/create or replace function public\.record_work_order_attachment_received[\s\S]*?\nend;\n\$\$;/)?.[0] || "";
    const storageCheck = fn.indexOf("from storage.objects");
    const insertRow = fn.indexOf("insert into public.work_order_attachments");
    const appendEvent = fn.indexOf("public._append_evidence_provenance_event");
    expect(storageCheck).toBeGreaterThan(-1);
    expect(storageCheck).toBeLessThan(insertRow);
    expect(storageCheck).toBeLessThan(appendEvent);
    expect(fn).toContain("raise exception 'storage object not found for work-order attachment'");
  });

  it("blocks post-completion contractor completion uploads and records observed status", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    const fn = sql.match(/create or replace function public\.record_work_order_attachment_received[\s\S]*?\nend;\n\$\$;/)?.[0] || "";
    expect(fn).toContain("p_maintenance_stage = 'contractor_completion'");
    expect(fn).toContain("only the assigned contractor can upload contractor completion evidence");
    expect(fn).toContain("contractor completion photo uploads are blocked after work-order completion or cancellation");
    expect(fn).toContain("work_order_status_at_received");
    expect(fn).toContain("v_work_order.status");
    expect(fn).toContain("late_upload");
    expect(fn).toContain("false");
  });

  it("labels client byte hash honestly and never server-verifies it in this slice", () => {
    const svc = read("src/services/workOrderAttachmentsService.js");
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(svc).toContain("subtle.digest(\"SHA-256\", buffer)");
    expect(svc).toContain("p_content_hash_client_asserted");
    expect(sql).toContain("'hash_trust', v_hash_trust");
    expect(sql).toContain("'client_asserted_unverified'");
    expect(sql).toContain("content_hash_verified_at");
    expect(sql).toContain("null");
  });

  it("contractor panel sets contractor completion metadata and does not wire MobileUploadZone", () => {
    const panel = read("src/components/work-orders/ContractorAttachmentsPanel.jsx");
    expect(panel).toContain('attesterRole: "contractor"');
    expect(panel).toContain('maintenanceStage: "contractor_completion"');
    expect(panel).toContain('captureMethod: "uploaded"');
    expect(panel).toContain("Upload completion photo");
    expect(panel).not.toContain("MobileUploadZone");
    expect(panel).not.toContain("in_app_camera");
  });

  it("does not change deposit-dispute pack rendering to overclaim completion proof", () => {
    const printPage = read("src/pages/documents/DepositDisputePackPrintPage.jsx");
    expect(printPage).not.toContain("Verified completion photo");
    expect(printPage).not.toContain("photo.received");
    expect(printPage).not.toContain("contractor_completion");
  });
});

// ---------------------------------------------------------------------------
// E-077: compareInspectionReports is wired via buildConditionComparisonRows
// ---------------------------------------------------------------------------

describe("E-077: Inspection comparison appears in pack when both reports present", () => {
  const checkIn = {
    inspection_type: "check_in",
    inspection_date: "2026-01-15",
    inspection_rooms: [
      {
        room_name: "Kitchen",
        inspection_evidence_items: [
          { item_label: "Floor", condition_rating: "good", notes: "Clean at move-in" },
          { item_label: "Worktop", condition_rating: "good", notes: "" },
        ],
      },
      {
        room_name: "Bedroom",
        inspection_evidence_items: [
          { item_label: "Carpet", condition_rating: "good", notes: "" },
        ],
      },
    ],
  };

  const checkOut = {
    inspection_type: "check_out",
    inspection_date: "2026-06-20",
    inspection_rooms: [
      {
        room_name: "Kitchen",
        inspection_evidence_items: [
          { item_label: "Floor", condition_rating: "damaged", notes: "Scratched and stained" },
          { item_label: "Worktop", condition_rating: "fair", notes: "Minor burn mark" },
        ],
      },
      {
        room_name: "Bedroom",
        inspection_evidence_items: [
          { item_label: "Carpet", condition_rating: "damaged", notes: "Large stain" },
        ],
      },
    ],
  };

  it("buildConditionComparisonRows returns non-null result when both check-in and check-out reports exist", () => {
    const result = buildConditionComparisonRows([checkIn, checkOut]);
    expect(result).not.toBeNull();
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("comparison rows appear in pack output with correct condition change data", () => {
    const result = buildConditionComparisonRows([checkIn, checkOut]);
    const kitchenFloor = result.rows.find(
      (r) => r.roomName === "Kitchen" && r.itemLabel === "Floor",
    );
    expect(kitchenFloor).toBeDefined();
    expect(kitchenFloor.checkInCondition).toBe("good");
    expect(kitchenFloor.checkOutCondition).toBe("damaged");
    expect(kitchenFloor.checkOutNotes).toContain("Scratched");
  });

  it("all matched rooms appear in the comparison output", () => {
    const result = buildConditionComparisonRows([checkIn, checkOut]);
    const rooms = new Set(result.rows.map((r) => r.roomName));
    expect(rooms.has("Kitchen")).toBe(true);
    expect(rooms.has("Bedroom")).toBe(true);
  });

  it("buildConditionComparisonRows returns null when check-out report is absent", () => {
    const result = buildConditionComparisonRows([checkIn]);
    expect(result).toBeNull();
  });

  it("buildConditionComparisonRows returns null when check-in report is absent", () => {
    const result = buildConditionComparisonRows([checkOut]);
    expect(result).toBeNull();
  });

  it("buildConditionComparisonRows returns null for empty report list", () => {
    const result = buildConditionComparisonRows([]);
    expect(result).toBeNull();
  });

  it("comparison includes check-in and check-out dates in result metadata", () => {
    const result = buildConditionComparisonRows([checkIn, checkOut]);
    expect(result.checkInDate).toBe("2026-01-15");
    expect(result.checkOutDate).toBe("2026-06-20");
  });

  it("print page imports buildConditionComparisonRows (not compareInspectionReports directly)", () => {
    const page = read("src/pages/documents/DepositDisputePackPrintPage.jsx");
    expect(page).toContain("buildConditionComparisonRows");
    expect(page).not.toContain("compareInspectionReports");
  });

  it("compareInspectionReports includes check-out-only items (no check-in baseline)", () => {
    const onlyOut = {
      inspection_type: "check_out",
      inspection_rooms: [
        {
          room_name: "Bathroom",
          inspection_evidence_items: [
            { item_label: "Tiles", condition_rating: "damaged", notes: "Cracked" },
          ],
        },
      ],
    };
    const rows = compareInspectionReports({}, onlyOut);
    const tile = rows.find((r) => r.itemLabel === "Tiles");
    expect(tile).toBeDefined();
    expect(tile.checkInCondition).toBeNull();
    expect(tile.checkOutCondition).toBe("damaged");
  });
});
