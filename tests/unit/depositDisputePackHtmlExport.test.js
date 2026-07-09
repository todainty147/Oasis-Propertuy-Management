/**
 * Headless harness for Deposit Dispute Pack v0 HTML artifact generation.
 *
 * Produces an HTML print-page artifact from a static demo fixture and writes
 * it to artifacts/deposit-dispute-pack-v0-demo.html for visual review.
 *
 * To generate the PDF:
 *   1. Open artifacts/deposit-dispute-pack-v0-demo.html in Chrome or Edge.
 *   2. Press Cmd+P (Mac) or Ctrl+P (Windows) to open Print.
 *   3. Set Destination to "Save as PDF".
 *   4. Set Paper size to A4, Margins to Default.
 *   5. Click Save. Rename to deposit-dispute-pack-v0-demo.pdf.
 *
 * Successor: E-158-family inspection-photo scan/serve review.
 * Evidence Vault inspection photos should be reviewed later for scan/serve-gate
 * parity before Tenaqo makes stronger photo safety, authenticity, or download
 * claims. Not implemented in this pass.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildConditionComparisonRows,
  buildDisputeTimeline,
  buildEvidenceIndex,
  calculateDeductionTotal,
  formatDisputePackMoney,
} from "../../src/lib/depositDisputePack.js";

const ARTIFACT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "deposit-dispute-pack-v0-demo.html",
);

// ── Static demo fixture ────────────────────────────────────────────────────

const DEMO_PACK = {
  id: "demo-pack-0001",
  title: "12 Demo Lane — Deposit Dispute Pack",
  status: "ready",
  deposit_amount: 1200,
  proposed_deduction_amount: 320,
  summary:
    "Deposit dispute arising from damage to kitchen floor and missing door key at end of tenancy on 20 June 2026. Evidence collected via Tenaqo Evidence Vault.",
  created_at: "2026-07-01T10:00:00Z",
};

const DEMO_PROPERTY = { address: "12 Demo Lane, London, SW1A 1AA" };
const DEMO_TENANT   = { name: "Alex Morgan", email: "alex.morgan@demo.test" };

const CHECK_IN_REPORT = {
  id: "demo-ci-report",
  inspection_type: "check_in",
  inspection_date: "2026-01-10",
  title: "Move-in inspection",
  inspection_rooms: [
    {
      room_name: "Kitchen",
      inspection_evidence_items: [
        { item_label: "Floor",    condition_rating: "good",    notes: "Clean, no damage." },
        { item_label: "Worktop",  condition_rating: "good",    notes: "Minor superficial marks." },
      ],
    },
    {
      room_name: "Living room",
      inspection_evidence_items: [
        { item_label: "Walls",    condition_rating: "excellent", notes: "Freshly painted." },
        { item_label: "Carpet",   condition_rating: "good",      notes: "Clean throughout." },
      ],
    },
  ],
};

const CHECK_OUT_REPORT = {
  id: "demo-co-report",
  inspection_type: "check_out",
  inspection_date: "2026-06-20",
  title: "Move-out inspection",
  inspection_rooms: [
    {
      room_name: "Kitchen",
      inspection_evidence_items: [
        { item_label: "Floor",    condition_rating: "damaged",    notes: "Deep parallel scratches across 60% of surface." },
        { item_label: "Worktop",  condition_rating: "fair",       notes: "Additional burn mark 5cm diameter." },
      ],
    },
    {
      room_name: "Living room",
      inspection_evidence_items: [
        { item_label: "Walls",    condition_rating: "fair",  notes: "Two scuff marks near door, repainting needed." },
        { item_label: "Carpet",   condition_rating: "good",  notes: "Clean, within fair wear and tear." },
      ],
    },
  ],
};

const DEMO_ITEMS = [
  {
    id: "item-1",
    item_type: "inspection_report",
    title: "Move-in inspection — 10 January 2026",
    evidence_reference_type: "check_in_report",
    evidence_reference_id: CHECK_IN_REPORT.id,
    claimed_amount: null,
    sort_order: 1,
  },
  {
    id: "item-2",
    item_type: "inspection_report",
    title: "Move-out inspection — 20 June 2026",
    evidence_reference_type: "check_out_report",
    evidence_reference_id: CHECK_OUT_REPORT.id,
    claimed_amount: null,
    sort_order: 2,
  },
  {
    id: "item-3",
    item_type: "deduction",
    title: "Kitchen floor repair and resurfacing",
    description: "Deep parallel scratches across 60% of kitchen floor surface. Beyond fair wear and tear.",
    claimed_amount: 280,
    sort_order: 3,
  },
  {
    id: "item-4",
    item_type: "deduction",
    title: "Replacement key",
    description: "One door key not returned at end of tenancy.",
    claimed_amount: 40,
    sort_order: 4,
  },
];

// ── HTML builder ──────────────────────────────────────────────────────────

function conditionLabel(rating) {
  const MAP = {
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    damaged: "Damaged",
    needs_review: "Needs review",
  };
  return MAP[rating] || rating || "Not recorded";
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDemoHtml({ pack, property, tenant, items, reports }) {
  const deductionTotal = calculateDeductionTotal(items);
  const evidenceIndex  = buildEvidenceIndex(items);
  const timeline       = buildDisputeTimeline(pack, reports);
  const comparison     = buildConditionComparisonRows(reports);
  const compRows       = comparison?.rows ?? [];
  const deductionItems = items.filter((i) => i.item_type === "deduction");

  const timelineRows = timeline.map((ev) => `
    <tr>
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap;border-bottom:1px solid #e2e8f0">${ev.date ? new Date(ev.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "No date"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escHtml(ev.label)}</td>
    </tr>`).join("");

  const evidenceRows = evidenceIndex.map((e) => `
    <tr>
      <td style="padding:6px 8px;font-weight:600;border-bottom:1px solid #e2e8f0">${e.number}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escHtml(e.typeLabel || String(e.type).replace(/_/g, " "))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escHtml(e.title)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escHtml(e.source)}</td>
    </tr>`).join("");

  const deductionBlocks = deductionItems.map((item) => `
    <div style="border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:12px;page-break-inside:avoid">
      <div style="display:flex;justify-content:space-between;gap:16px">
        <strong>${escHtml(item.title)}</strong>
        <span style="font-weight:600;white-space:nowrap">${formatDisputePackMoney(item.claimed_amount)}</span>
      </div>
      ${item.description ? `<p style="margin:8px 0 0;font-size:13px;color:#475569">${escHtml(item.description)}</p>` : ""}
    </div>`).join("");

  const comparisonRows = compRows.map((row) => `
    <tr>
      <td style="padding:6px 8px;font-weight:600;border-bottom:1px solid #e2e8f0;vertical-align:top">${escHtml(row.roomName)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top">${escHtml(row.itemLabel)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top">${escHtml(conditionLabel(row.checkInCondition))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top">${escHtml(conditionLabel(row.checkOutCondition))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px;color:#64748b">
        ${escHtml([row.checkInNotes && `In: ${row.checkInNotes}`, row.checkOutNotes && `Out: ${row.checkOutNotes}`].filter(Boolean).join(" · ") || "")}
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Deposit Dispute Pack — ${escHtml(pack.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      margin: 0;
      padding: 24px;
    }
    .document {
      max-width: 860px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      padding: 40px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.07);
    }
    h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; margin: 12px 0 8px; }
    h2 { font-size: 1.05rem; font-weight: 700; margin: 24px 0 12px; }
    .badge { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b; }
    .caveat {
      border: 2px solid #fbbf24;
      background: #fffbeb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .caveat h2 { color: #92400e; margin: 0 0 12px; font-size: 1rem; }
    .caveat p { color: #92400e; font-size: 13px; line-height: 1.6; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-bottom: 1px solid #cbd5e1; padding: 20px 0; }
    .grid-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
    .grid-value { font-size: 14px; font-weight: 600; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px; border-bottom: 1px solid #cbd5e1; font-weight: 700; }
    section { margin-top: 24px; page-break-inside: avoid; }
    footer { border-top: 1px solid #cbd5e1; margin-top: 32px; padding-top: 16px; font-size: 11px; color: #64748b; }
    @media print {
      body { background: white; padding: 0; }
      .document { border: none; box-shadow: none; border-radius: 0; max-width: 100%; padding: 20px; }
      @page { size: A4; margin: 14mm; }
    }
  </style>
</head>
<body>
<article class="document">

  <!-- Header -->
  <section style="border-bottom:4px solid #0f172a;padding-bottom:20px">
    <p class="badge">Tenaqo Evidence Vault</p>
    <h1>Deposit Dispute Pack</h1>
    <p style="font-size:1.05rem;font-weight:600">${escHtml(pack.title)}</p>
  </section>

  <!-- Caveat banner -->
  <div class="caveat">
    <h2>Important limitations — please read</h2>
    <p>This pack is an operational evidence record. It is not legal advice, legal sign-off, or a decision by a deposit adjudicator.</p>
    <p>Condition ratings, deduction amounts, notes, and evidence links are records held in Tenaqo. They do not by themselves prove legal liability, tenant fault, or that a deduction is valid.</p>
    <p>Photos shown in this pack are uploaded evidence records. Tenaqo does not independently authenticate when, where, or by whom the photo was originally taken.</p>
    <p>Signatures and acknowledgements show that a user acted through the relevant portal at the recorded time. They do not by themselves prove legal agreement beyond the recorded acknowledgement.</p>
    <p>A locked report is a business-process lock in Tenaqo. It is not a cryptographic seal of the report contents.</p>
  </div>

  <!-- Pack summary grid -->
  <section class="grid">
    <div>
      <p class="grid-label">Property</p>
      <p class="grid-value">${escHtml(property.address)}</p>
    </div>
    <div>
      <p class="grid-label">Tenant</p>
      <p class="grid-value">${escHtml(tenant.name)}</p>
    </div>
    <div>
      <p class="grid-label">Deposit held</p>
      <p class="grid-value">${formatDisputePackMoney(pack.deposit_amount)}</p>
    </div>
    <div>
      <p class="grid-label">Proposed deduction</p>
      <p class="grid-value">${formatDisputePackMoney(pack.proposed_deduction_amount)}</p>
    </div>
    <div>
      <p class="grid-label">Deduction schedule total</p>
      <p class="grid-value">${formatDisputePackMoney(deductionTotal)}</p>
    </div>
    <div>
      <p class="grid-label">Pack created</p>
      <p class="grid-value">${pack.created_at ? new Date(pack.created_at).toLocaleString("en-GB") : "Not recorded"}</p>
    </div>
  </section>

  ${pack.summary ? `
  <section>
    <h2>Summary</h2>
    <p style="font-size:14px;line-height:1.7;color:#475569">${escHtml(pack.summary)}</p>
  </section>` : ""}

  <!-- Timeline -->
  <section>
    <h2>Timeline</h2>
    ${timeline.length === 0 ? `<p style="font-size:13px;color:#475569">No timeline events recorded.</p>` : `
    <table>
      <tbody>${timelineRows}</tbody>
    </table>`}
  </section>

  <!-- Deduction schedule -->
  <section>
    <h2>Deduction schedule</h2>
    ${deductionItems.length === 0 ? `<p style="font-size:13px;color:#475569">No deduction items added.</p>` : deductionBlocks}
  </section>

  <!-- Evidence index -->
  <section>
    <h2>Evidence index</h2>
    ${evidenceIndex.length === 0 ? `<p style="font-size:13px;color:#475569">No evidence references.</p>` : `
    <table>
      <thead>
        <tr>
          <th>#</th><th>Evidence type</th><th>Title</th><th>Source</th>
        </tr>
      </thead>
      <tbody>${evidenceRows}</tbody>
    </table>`}
  </section>

  <!-- Check-in / check-out comparison -->
  <section>
    <h2>Check-in / check-out comparison</h2>
    ${compRows.length === 0 ? `<p style="font-size:13px;color:#475569">No comparison data available.</p>` : `
    <table>
      <thead>
        <tr>
          <th>Room</th><th>Item</th><th>Check-in</th><th>Check-out</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>${comparisonRows}</tbody>
    </table>`}
  </section>

  <!-- Signatures -->
  <section>
    <h2>Signatures and tenant response</h2>
    <p style="font-size:13px;color:#475569">No signatures in this demo fixture. Signatures are recorded via the Evidence Vault and captured through the <code>capture_inspection_signature</code> RPC (E-033).</p>
  </section>

  <!-- Photos -->
  <section>
    <h2>Photos</h2>
    <p style="font-size:13px;color:#475569">No photos in this demo fixture. Photos are served via signed document URLs in the live app. Tenaqo does not independently authenticate photo metadata. <em>Successor: E-158-family inspection-photo scan/serve review.</em></p>
  </section>

  <footer>
    Generated via Tenaqo Evidence Vault ·
    Operational evidence record only ·
    Not legal advice or a deposit adjudicator decision ·
    Generated ${new Date().toLocaleString("en-GB")}
  </footer>

</article>
</body>
</html>`;
}

// ── Test harness ──────────────────────────────────────────────────────────

let html = "";

beforeAll(() => {
  html = buildDemoHtml({
    pack:     DEMO_PACK,
    property: DEMO_PROPERTY,
    tenant:   DEMO_TENANT,
    items:    DEMO_ITEMS,
    reports:  [CHECK_IN_REPORT, CHECK_OUT_REPORT],
  });
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, html, "utf8");
});

afterAll(() => {
  // Leave artifact in place for visual review.
});

describe("Deposit Dispute Pack v0 — HTML artifact generation", () => {
  it("produces a non-empty HTML document", () => {
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("writes the artifact to disk", () => {
    expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
    const size = fs.statSync(ARTIFACT_PATH).size;
    expect(size).toBeGreaterThan(2000);
  });
});

describe("Deposit Dispute Pack v0 — honesty / caveat banner", () => {
  it("contains the Important limitations heading", () => {
    expect(html).toContain("Important limitations");
  });

  it("states pack is not legal advice or adjudicator decision", () => {
    expect(html).toContain("not legal advice, legal sign-off, or a decision by a deposit adjudicator");
  });

  it("states photos are not independently authenticated", () => {
    expect(html).toContain("does not independently authenticate");
  });

  it("states signatures are portal acknowledgements only", () => {
    expect(html).toContain("do not by themselves prove legal agreement beyond the recorded acknowledgement");
  });

  it("states locked is a business-process lock, not cryptographic", () => {
    expect(html).toContain("business-process lock in Tenaqo");
    expect(html).toContain("not a cryptographic seal");
  });

  it("does not claim damage is proven or deduction is legally valid", () => {
    expect(html).not.toContain("damage is proven");
    expect(html).not.toContain("deduction is legally valid");
    expect(html).not.toContain("photos are authenticated");
    expect(html).not.toContain("adjudicator will accept");
  });
});

describe("Deposit Dispute Pack v0 — pack sections", () => {
  it("renders the pack title", () => {
    expect(html).toContain("12 Demo Lane — Deposit Dispute Pack");
  });

  it("renders the property address", () => {
    expect(html).toContain("12 Demo Lane, London");
  });

  it("renders the deposit amount", () => {
    expect(html).toContain("£1,200.00");
  });

  it("renders the deduction schedule total (£320)", () => {
    expect(html).toContain("£320.00");
  });

  it("renders deduction items with amounts", () => {
    expect(html).toContain("Kitchen floor repair");
    expect(html).toContain("£280.00");
    expect(html).toContain("Replacement key");
    expect(html).toContain("£40.00");
  });

  it("renders the evidence index with inspection report references", () => {
    expect(html).toContain("check in report");
    expect(html).toContain("check out report");
  });

  it("renders check-in / check-out comparison with condition change", () => {
    expect(html).toContain("Kitchen");
    expect(html).toContain("Floor");
    expect(html).toContain("Good");
    expect(html).toContain("Damaged");
  });

  it("includes the photo disclaimer and successor note", () => {
    expect(html).toContain("E-158-family inspection-photo scan/serve review");
  });

  it("renders a footer with operational record label", () => {
    expect(html).toContain("Operational evidence record only");
    expect(html).toContain("Not legal advice or a deposit adjudicator decision");
  });
});
