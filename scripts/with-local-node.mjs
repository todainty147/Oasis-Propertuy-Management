import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const ESBUILD_PACKAGE_BY_PLATFORM = {
  "darwin arm64": "darwin-arm64",
  "darwin x64": "darwin-x64",
  "linux arm64": "linux-arm64",
  "linux x64": "linux-x64",
  "win32 arm64": "win32-arm64",
  "win32 x64": "win32-x64",
};

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

function checkNativeEsbuildPackage() {
  const esbuildDir = join(process.cwd(), "node_modules", "@esbuild");
  if (!existsSync(esbuildDir)) return true;

  const expectedPackage = ESBUILD_PACKAGE_BY_PLATFORM[`${process.platform} ${process.arch}`];
  if (!expectedPackage) return true;

  const expectedPath = join(esbuildDir, expectedPackage);
  if (existsSync(expectedPath)) return true;

  const knownPackages = Object.values(ESBUILD_PACKAGE_BY_PLATFORM);
  const installedOtherPackage = knownPackages.find((packageName) => existsSync(join(esbuildDir, packageName)));
  if (!installedOtherPackage) return true;

  console.error([
    "",
    "Native dependency mismatch detected before starting Node tooling.",
    `This install contains @esbuild/${installedOtherPackage}, but ${process.platform}/${process.arch} needs @esbuild/${expectedPackage}.`,
    "",
    "Fix:",
    "- If you are running from PowerShell/CMD, reinstall dependencies from PowerShell with: npm install",
    "- If you are running from WSL, run the npm command from WSL instead of PowerShell.",
    "",
    "Avoid sharing one node_modules folder between Windows Node and WSL/Linux Node.",
    "",
  ].join("\n"));
  return false;
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

if (!checkNativeEsbuildPackage()) {
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
