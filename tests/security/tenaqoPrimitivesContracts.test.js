import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActionPill,
  EmptyState,
  MetricTile,
  PageHeader,
  PageShell,
  StatusPill,
  TenaqoCard,
} from "../../src/components/ui/TenaqoPrimitives.jsx";

describe("Tenaqo UI primitives", () => {
  it("PageShell renders children inside the calm page shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(PageShell, null, "Workspace"),
    );

    expect(html).toContain("tenaqo-page-shell");
    expect(html).toContain("Workspace");
  });

  it("PageHeader renders title, subtitle, and actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, {
        title: "Operations Hub",
        subtitle: "Today’s action queue.",
        actions: React.createElement("button", null, "Refresh"),
      }),
    );

    expect(html).toContain("Operations Hub");
    expect(html).toContain("Today’s action queue.");
    expect(html).toContain("Refresh");
  });

  it("TenaqoCard and MetricTile expose reusable surface classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(TenaqoCard, { variant: "elevated" },
        React.createElement(MetricTile, {
          label: "Occupied units",
          value: "12",
          context: "of 14 units",
          status: "success",
        }),
      ),
    );

    expect(html).toContain("tenaqo-card--elevated");
    expect(html).toContain("tenaqo-metric-tile");
    expect(html).toContain("Occupied units");
    expect(html).toContain("12");
  });

  it("StatusPill and ActionPill keep clear accessible text", () => {
    const html = renderToStaticMarkup(
      React.createElement("div", null,
        React.createElement(StatusPill, { variant: "warning" }, "Pending"),
        React.createElement(ActionPill, { active: true }, "This week"),
      ),
    );

    expect(html).toContain("tenaqo-status-pill--warning");
    expect(html).toContain("Pending");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("This week");
  });

  it("EmptyState renders copy and an optional action", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "No urgent items",
        body: "Everything is calm.",
        action: React.createElement("button", null, "Open calendar"),
      }),
    );

    expect(html).toContain("No urgent items");
    expect(html).toContain("Everything is calm.");
    expect(html).toContain("Open calendar");
  });
});
