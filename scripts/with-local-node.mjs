import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

function resolveSafeTempDir() {
  const candidates = process.platform === "win32"
    ? [process.env.TEMP, process.env.TMP, process.env.TMPDIR]
    : ["/tmp", process.env.TMPDIR, process.env.TEMP, process.env.TMP];

  return candidates.find((candidate) => candidate && existsSync(candidate)) || "/tmp";
}

function resolveLocalNodeBin() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (!home) return null;

  const candidate = join(home, ".local", "nodejs", "bin");
  return existsSync(candidate) ? candidate : null;
}

function resolveNodeModulesBin() {
  const candidate = join(process.cwd(), "node_modules", ".bin");
  return existsSync(candidate) ? candidate : null;
}

function quoteArg(arg) {
  const value = String(arg ?? "");
  if (!value) return '""';
  if (!/[^\w@%+=:,./-]/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/with-local-node.mjs <command> [...args]");
  process.exit(1);
}

const safeTempDir = resolveSafeTempDir();
const localNodeBin = resolveLocalNodeBin();
const nodeModulesBin = resolveNodeModulesBin();
const command = args.map(quoteArg).join(" ");
const pathParts = [
  nodeModulesBin,
  localNodeBin,
  process.env.PATH || "",
].filter(Boolean);

const child = spawn(command, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PATH: pathParts.join(process.platform === "win32" ? ";" : ":"),
    TMPDIR: safeTempDir,
    TEMP: safeTempDir,
    TMP: safeTempDir,
  },
});

child.on("error", (error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
