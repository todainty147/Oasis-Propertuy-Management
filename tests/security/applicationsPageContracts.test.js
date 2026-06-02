import { readFileSync } from "node:fs";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("applications page loading contracts", () => {
  it("uses one shared load path for initial load and refresh actions", () => {
    const source = readSource("src/pages/applications/ApplicationsPage.jsx");

    expect(source).toContain("const load = useCallback(async ({ isCurrent = () => mountedRef.current } = {}) =>");
    expect(source).toContain("let cancelled = false;");
    expect(source).toContain("load({ isCurrent: () => mountedRef.current && !cancelled })");
    expect(source).toContain("cancelled = true;");
    expect(source).toContain("await load();");
    expect(source).not.toContain("async function loadInitial");
    expect(source).not.toContain("throw err;");
  });
});
