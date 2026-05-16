import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import BrandLogo from "../../src/components/BrandLogo.jsx";

describe("BrandLogo", () => {
  it("renders the Tenaqo wordmark and subtitle as live text", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandLogo, { variant: "sidebar", showSubtitle: true }),
    );

    expect(html).toContain("Tenaqo");
    expect(html).toContain("Rental operations software");
    expect(html).toContain("/brand/tenaqo/logo-icon-transparent.png");
  });

  it("hides the subtitle in compact mode", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandLogo, { variant: "header", compact: true, showSubtitle: true }),
    );

    expect(html).toContain("Tenaqo");
    expect(html).not.toContain("Rental operations software");
  });

  it("renders an accessible icon-only logo", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandLogo, { variant: "icon" }),
    );

    expect(html).toContain('aria-label="Tenaqo"');
    expect(html).toContain('alt=""');
    expect(html).not.toContain("Rental operations software");
  });

  it("is used by the app sidebar", () => {
    const sidebarSource = readFileSync("src/layout/Sidebar.jsx", "utf8");

    expect(sidebarSource).toContain("import BrandLogo");
    expect(sidebarSource).toContain("<BrandLogo");
  });
});
