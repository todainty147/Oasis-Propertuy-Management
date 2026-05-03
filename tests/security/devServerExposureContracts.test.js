import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("local development exposure guardrails", () => {
  it("binds Vite dev and preview servers to localhost", () => {
    const viteConfig = readSource("vite.config.js");
    const packageJson = readSource("package.json");

    expect(viteConfig).toContain("server:");
    expect(viteConfig).toContain('host: "127.0.0.1"');
    expect(viteConfig).toContain("preview:");
    expect(packageJson).toContain('"dev": "node scripts/with-local-node.mjs vite"');
    expect(packageJson).not.toContain("--host 0.0.0.0");
    expect(packageJson).not.toContain("--host true");
  });

  it("documents tunnel restrictions and keeps example env values non-production", () => {
    const localDevSecurity = readSource("docs/LOCAL_DEV_SECURITY.md");
    const readme = readSource("README.md");
    const envExample = readSource(".env.example");
    const gitignore = readSource(".gitignore");

    expect(localDevSecurity).toContain("Do not expose local dev servers");
    expect(localDevSecurity).toContain("ngrok");
    expect(localDevSecurity).toContain("Cloudflare Tunnel");
    expect(localDevSecurity).toContain("non-production resources");
    expect(localDevSecurity).toContain("Do not run Vite with `--host 0.0.0.0` or `--host true`");
    expect(readme).toContain("docs/LOCAL_DEV_SECURITY.md");
    expect(envExample).toContain("http://127.0.0.1:54321");
    expect(envExample).toContain("your_local_supabase_anon_key");
    expect(envExample).not.toContain("nodpjtkuefcmnxqxjtul");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
  });
});
