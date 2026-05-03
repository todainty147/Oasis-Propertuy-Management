import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

const DEFAULT_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

function formatViolation(violation) {
  const nodes = violation.nodes
    .slice(0, 3)
    .map((node) => `    - ${node.target.join(", ")}: ${node.failureSummary || "No failure summary"}`)
    .join("\n");

  return [
    `${violation.id} (${violation.impact})`,
    `  ${violation.help}`,
    `  ${violation.helpUrl}`,
    nodes,
  ].filter(Boolean).join("\n");
}

export async function expectNoBlockingAccessibilityViolations(page, label, options = {}) {
  const builder = new AxeBuilder({ page }).withTags(options.tags || DEFAULT_TAGS);

  for (const selector of options.exclude || []) {
    builder.exclude(selector);
  }

  const results = await builder.analyze();
  const blockingViolations = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact),
  );

  expect(
    blockingViolations,
    `${label} has blocking accessibility violations:\n\n${blockingViolations.map(formatViolation).join("\n\n")}`,
  ).toEqual([]);
}
