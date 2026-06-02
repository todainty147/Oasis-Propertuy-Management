import { readFileSync } from "node:fs";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("applications page loading contracts", () => {
  it("uses one shared load path for initial load and refresh actions", () => {
    const source = readSource("src/pages/applications/ApplicationsPage.jsx");

    expect(source).toContain("const activeAccountIdRef = useRef(activeAccountId);");
    expect(source).toContain("const load = useCallback(async ({ accountId = activeAccountId, isCurrent = () => mountedRef.current } = {}) =>");
    expect(source).toContain("let cancelled = false;");
    expect(source).toContain("activeAccountIdRef.current === accountId");
    expect(source).toContain("cancelled = true;");
    expect(source).toContain("accountId,");
    expect(source).toContain("isCurrent: () => mountedRef.current && activeAccountIdRef.current === accountId");
    expect(source).not.toContain("async function loadInitial");
    expect(source).not.toContain("throw err;");
  });
});
