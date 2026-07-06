/**
 * Headless harness for Maintenance Evidence Pack v0 PDF generation.
 *
 * Produces a PDF from a static discharged/completed scenario fixture and
 * verifies all required sections are present. Written to
 * artifacts/maintenance-evidence-pack-v0-demo.pdf for visual review.
 *
 * Uses rawPdfBuffer.toString("binary").includes() for all content assertions
 * because jsPDF uses WinAnsi/CP1252 encoding — ASCII-safe substrings only.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateMaintenancePackPdf } from "../../src/utils/maintenanceEvidencePackPdfExport.js";

const ARTIFACT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "maintenance-evidence-pack-v0-demo.pdf",
);

// Static fixture: completed work order scenario
const STATIC_PAYLOAD = {
  workOrder: {
    id: "wo000001-0000-0000-0000-000000000001",
    account_id: "ac000001-0000-0000-0000-000000000001",
    property_id: "pr000001-0000-0000-0000-000000000001",
    maintenance_request_id: "mr000001-0000-0000-0000-000000000001",
    contractor_user_id: "cu000001-0000-0000-0000-000000000001",
    contractor_name: "Jack Plumber",
    contractor_phone: "+447700900201",
    status: "completed",
    quote_amount: "350.00",
    invoice_amount: "420.00",
    notes: "Replaced pressure valve and bled all radiators.",
    scheduled_at: null,
    created_at: "2026-06-10T09:00:00.000Z",
    updated_at: "2026-06-15T14:30:00.000Z",
  },
  maintenanceRequest: {
    id: "mr000001-0000-0000-0000-000000000001",
    title: "Leaky boiler in kitchen",
    description: "Water leaking from the pressure valve below the boiler.",
    priority: "high",
    status: "resolved",
    created_at: "2026-06-08T10:00:00.000Z",
    updated_at: "2026-06-15T14:35:00.000Z",
  },
  property: {
    id: "pr000001-0000-0000-0000-000000000001",
    address: "1 Cavallo Street",
    city: "London",
  },
  contractor: {
    id: "co000001-0000-0000-0000-000000000001",
    name: "Jack Plumber",
    phone: "+447700900201",
    email: "jack@jackplumber.test",
    user_id: "cu000001-0000-0000-0000-000000000001",
  },
  attachments: [
    {
      id: "at000001-0000-0000-0000-000000000001",
      file_name: "completion_photo.jpg",
      mime_type: "image/jpeg",
      file_size: 204800,
      maintenance_stage: "contractor_completion",
      attester_role: "contractor",
      capture_method: "uploaded",
      content_hash_client_asserted:
        "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
      content_hash_server_computed:
        "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
      hash_trust: "verified",
      content_hash_verified_at: "2026-06-15T14:00:00.000Z",
      created_at: "2026-06-15T13:45:00.000Z",
      provenance_event_id: "pe000001-0000-0000-0000-000000000001",
    },
    {
      id: "at000002-0000-0000-0000-000000000002",
      file_name: "before_repair.jpg",
      mime_type: "image/jpeg",
      file_size: 180000,
      maintenance_stage: "pre_work",
      attester_role: "landlord",
      capture_method: "uploaded",
      content_hash_client_asserted: null,
      content_hash_server_computed: null,
      hash_trust: "not_available",
      content_hash_verified_at: null,
      created_at: "2026-06-10T09:30:00.000Z",
      provenance_event_id: null,
    },
  ],
  provenance: [
    {
      id: "pe000001-0000-0000-0000-000000000001",
      event_type: "photo.received",
      entity_type: "work_order",
      entity_id: "wo000001-0000-0000-0000-000000000001",
      occurred_at: "2026-06-15T13:45:00.000Z",
      sequence_number: 1,
      summary: "Contractor completion photo received",
      metadata: { file_name: "completion_photo.jpg" },
      account_id: "ac000001-0000-0000-0000-000000000001",
    },
    {
      id: "pe000002-0000-0000-0000-000000000002",
      event_type: "photo.hash_verified",
      entity_type: "work_order",
      entity_id: "wo000001-0000-0000-0000-000000000001",
      occurred_at: "2026-06-15T14:00:00.000Z",
      sequence_number: 2,
      summary: "File hash verified: client and server hashes match",
      metadata: {},
      account_id: "ac000001-0000-0000-0000-000000000001",
    },
  ],
  generatedAt: "2026-07-06T10:00:00.000Z",
};

let rawPdfBuffer;

beforeAll(() => {
  const { doc } = generateMaintenancePackPdf(STATIC_PAYLOAD);
  rawPdfBuffer = Buffer.from(doc.output("arraybuffer"));
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, rawPdfBuffer);
});

afterAll(() => {
  // Leave artifact in place for visual review.
});

describe("Maintenance Evidence Pack PDF — generation", () => {
  it("produces a valid PDF file", () => {
    expect(rawPdfBuffer.length).toBeGreaterThan(1000);
    expect(rawPdfBuffer.toString("ascii", 0, 5)).toBe("%PDF-");
  });

  it("writes the PDF artifact to disk", () => {
    expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
  });
});

describe("Maintenance Evidence Pack PDF — required sections", () => {
  function pdfContains(str) {
    return rawPdfBuffer.toString("binary").includes(str);
  }

  it("renders the pack title", () => {
    expect(pdfContains("Maintenance Evidence Pack")).toBe(true);
  });

  it("renders the demo / legal-status watermark label", () => {
    expect(pdfContains("Demo maintenance pack")).toBe(true);
  });

  it("renders the pack intro referencing Tenaqo", () => {
    expect(pdfContains("maintenance evidence recorded in Tenaqo")).toBe(true);
  });

  it("renders property address", () => {
    expect(pdfContains("1 Cavallo Street")).toBe(true);
  });

  it("renders maintenance request title", () => {
    expect(pdfContains("Leaky boiler in kitchen")).toBe(true);
  });

  it("renders contractor name", () => {
    expect(pdfContains("Jack Plumber")).toBe(true);
  });

  it("renders work order completed status", () => {
    expect(pdfContains("Completed")).toBe(true);
  });

  it("renders photo file name in evidence references", () => {
    expect(pdfContains("completion_photo.jpg")).toBe(true);
  });

  it("renders metadata-only disclaimer with no downloads", () => {
    expect(pdfContains("metadata only")).toBe(true);
    expect(pdfContains("previews and downloads are not included")).toBe(true);
  });

  it("renders hash verification status as verified", () => {
    expect(pdfContains("Stored file hash: verified")).toBe(true);
  });

  it("renders stored byte integrity only caveat", () => {
    expect(pdfContains("stored byte integrity only")).toBe(true);
  });

  it("renders proof trail with photo.received humanized", () => {
    expect(pdfContains("Photo received")).toBe(true);
  });

  it("renders proof trail with photo.hash_verified humanized", () => {
    expect(pdfContains("File hash verified")).toBe(true);
  });

  it("renders Important limitations section", () => {
    expect(pdfContains("Important limitations")).toBe(true);
  });

  it("renders please read in Important limitations header (ASCII-safe check)", () => {
    expect(pdfContains("please read")).toBe(true);
  });

  it("renders completion time derivation caveat", () => {
    expect(pdfContains("no dedicated completed_at")).toBe(true);
  });

  it("renders antivirus scanning not included caveat", () => {
    expect(pdfContains("Antivirus scanning")).toBe(true);
    expect(pdfContains("not included in this v0 pack")).toBe(true);
  });

  it("renders cost quote amount", () => {
    expect(pdfContains("350.00")).toBe(true);
  });

  it("renders cost invoice amount", () => {
    expect(pdfContains("420.00")).toBe(true);
  });
});

describe("Maintenance Evidence Pack PDF — honesty boundaries", () => {
  function pdfContains(str) {
    return rawPdfBuffer.toString("binary").includes(str);
  }

  it("does not claim antivirus clean or scan status", () => {
    const raw = rawPdfBuffer.toString("binary");
    expect(raw.includes("antivirus clean")).toBe(false);
    expect(raw.includes("scan_clean")).toBe(false);
    expect(raw.includes("AV clean")).toBe(false);
    expect(raw.includes("The file is safe")).toBe(false);
  });

  it("does not include download links or photo previews", () => {
    const raw = rawPdfBuffer.toString("binary");
    expect(raw.includes("Download photo")).toBe(false);
    expect(raw.includes("signed-url")).toBe(false);
    expect(raw.includes("storage.supabase")).toBe(false);
  });

  it("does not make positive completion or authenticity claims", () => {
    const raw = rawPdfBuffer.toString("binary");
    expect(raw.includes("Tenaqo confirms the work was completed")).toBe(false);
    expect(raw.includes("This photo proves the repair was completed")).toBe(false);
    expect(raw.includes("Tenaqo verifies the photo is authentic")).toBe(false);
  });
});
