import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/hooks/useProperties.js"), "utf8");

describe("useProperties hook contracts", () => {
  it("exposes an explicit refetch function for post-mutation refreshes", () => {
    expect(source).toContain("const loadProperties = useCallback(async () =>");
    expect(source).toContain("return { properties, loading, error, refetch: loadProperties };");
  });

  it("uses the same loader for realtime refreshes and manual refetches", () => {
    expect(source).toContain("loadProperties();");
    expect(source).toContain(",\n        loadProperties\n      )");
  });
});
