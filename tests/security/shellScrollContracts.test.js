import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("App shell scrolling", () => {
  it("locks document scrolling and delegates page scroll to the main app pane", () => {
    const source = readFileSync("src/layout/AppLayout.jsx", "utf8");

    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('document.documentElement.style.overflow = "hidden"');
    expect(source).toContain("overflow-y-auto");
  });
});
