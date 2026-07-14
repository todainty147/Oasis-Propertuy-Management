import type { Metadata } from "next";
import Link from "next/link";

import { FinalCta } from "../../../components/marketing/final-cta";
import {
  comparisonRows,
  comparisonPageCopy,
  comparisonStatusLabels,
  type ComparisonStatus,
} from "../../../content/comparisons/tenaqo-vs-landlord-management-apps";
import { buildMetadata } from "../../../lib/metadata";
import { siteConfig } from "../../../content/site";

export const metadata: Metadata = {
  ...buildMetadata({
    title: comparisonPageCopy.seo.title,
    description: comparisonPageCopy.seo.description,
    canonical: `${siteConfig.url}/compare/tenaqo-vs-landlord-management-apps`,
    // English-only: no pl/de hreflang. Polish placeholder redirects here (308).
    languages: {
      en: "/compare/tenaqo-vs-landlord-management-apps",
      "x-default": "/compare/tenaqo-vs-landlord-management-apps",
    },
  }),
  // Keep noindex until both evidence gates (Tenaqo status audit + market-category
  // source audit) are explicitly approved. Do not remove before that sign-off.
  robots: { index: false, follow: true },
};

// Maps a status to a descriptive style. Pilot/planned/not-offered must be
// visually distinct so they are never read as positive availability signals.
function StatusLabel({ status }: { status: ComparisonStatus }) {
  const isUnavailable =
    status === "pilot" || status === "planned" || status === "not-offered";

  return (
    <span
      className={`comparison-status comparison-status--${status}`}
      style={{
        display: "inline-block",
        fontWeight: isUnavailable ? 400 : 500,
        color: isUnavailable ? "var(--color-text-muted, #6b7280)" : "inherit",
        fontStyle: isUnavailable ? "italic" : "normal",
        marginBottom: "0.375rem",
        fontSize: "0.875rem",
      }}
    >
      {comparisonStatusLabels[status]}
    </span>
  );
}

export default function TenaqoVsLandlordManagementAppsPage() {
  // Collect group names in first-encounter order for rendering section headers.
  const groups: string[] = [];
  for (const row of comparisonRows) {
    if (row.group && !groups.includes(row.group)) {
      groups.push(row.group);
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="section" style={{ paddingBottom: "2rem" }}>
        <div className="container">
          <span className="eyebrow">{comparisonPageCopy.hero.eyebrow}</span>
          <h1 style={{ marginTop: "0.5rem", maxWidth: 640 }}>
            {comparisonPageCopy.hero.title}
          </h1>
          <p className="muted" style={{ maxWidth: 600, marginTop: "0.75rem" }}>
            {comparisonPageCopy.hero.body}
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="section" style={{ paddingTop: "0" }}>
        <div className="container">
          <div style={{ overflowX: "auto" }}>
            <table
              className="comparison-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9375rem",
              }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "0.75rem 1rem 0.75rem 0",
                      borderBottom: "2px solid var(--color-border, #e5e7eb)",
                      width: "30%",
                      fontSize: "0.8125rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "var(--color-text-muted, #6b7280)",
                    }}
                  >
                    {comparisonPageCopy.tableHeaders.dimension}
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "0.75rem 1rem",
                      borderBottom: "2px solid var(--color-border, #e5e7eb)",
                      width: "35%",
                      fontSize: "0.8125rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "var(--color-text-muted, #6b7280)",
                    }}
                  >
                    {comparisonPageCopy.tableHeaders.tenaqo}
                  </th>
                  <th
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "0.75rem 0 0.75rem 1rem",
                      borderBottom: "2px solid var(--color-border, #e5e7eb)",
                      width: "35%",
                      fontSize: "0.8125rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "var(--color-text-muted, #6b7280)",
                    }}
                  >
                    {comparisonPageCopy.tableHeaders.category}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => {
                  const isFirstInGroup =
                    row.group !== undefined &&
                    (i === 0 || comparisonRows[i - 1].group !== row.group);

                  return (
                    <>
                      {isFirstInGroup && (
                        <tr key={`group-${row.group}`} aria-hidden="true">
                          <td
                            colSpan={3}
                            style={{
                              padding: "1.25rem 0 0.375rem",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              color: "var(--color-text-muted, #6b7280)",
                              fontWeight: 600,
                              borderTop: "1px solid var(--color-border, #e5e7eb)",
                            }}
                          >
                            {row.group}
                          </td>
                        </tr>
                      )}
                      <tr
                        key={row.dimension}
                        style={{
                          borderBottom: "1px solid var(--color-border, #e5e7eb)",
                        }}
                      >
                        <th
                          scope="row"
                          style={{
                            textAlign: "left",
                            padding: "1rem 1rem 1rem 0",
                            fontWeight: 500,
                            verticalAlign: "top",
                            fontSize: "0.9375rem",
                          }}
                        >
                          {row.dimension}
                        </th>
                        <td
                          style={{
                            padding: "1rem 1rem",
                            verticalAlign: "top",
                          }}
                        >
                          <StatusLabel status={row.tenaqoStatus} />
                          <p
                            className="muted"
                            style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6 }}
                          >
                            {row.tenaqoSummary}
                          </p>
                        </td>
                        <td
                          style={{
                            padding: "1rem 0 1rem 1rem",
                            verticalAlign: "top",
                          }}
                        >
                          <p
                            className="muted"
                            style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6 }}
                          >
                            {row.categorySummary}
                          </p>
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Methodology note */}
          <div
            className="blog-article__note"
            role="note"
            aria-label="Methodology"
            style={{ marginTop: "2rem" }}
          >
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              <strong>Methodology: </strong>
              {comparisonPageCopy.methodology}
            </p>
          </div>

          {/* Help link */}
          <p className="muted" style={{ marginTop: "1.5rem", fontSize: "0.875rem" }}>
            Questions about a specific capability?{" "}
            <Link href="/help">Visit the Help Centre</Link> or{" "}
            <Link href="/help/contact-support">contact the support team</Link>.
          </p>
        </div>
      </section>

      <FinalCta {...comparisonPageCopy.finalCta} />
    </>
  );
}
