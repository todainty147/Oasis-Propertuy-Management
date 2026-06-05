import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const functionsDir = join(root, "supabase", "functions");
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg ? scopeArg.slice("--scope=".length) : "all";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name === "index.ts" ? [path] : [];
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function toWslPath(path) {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function findDeno() {
  const candidates = [
    process.env.DENO_BIN,
    "deno",
    join(process.env.HOME || "", ".deno", "bin", "deno"),
    join(process.env.USERPROFILE || "", ".deno", "bin", "deno.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", shell: false });
    if (result.status === 0) {
      return {
        label: candidate,
        check(file) {
          return spawnSync(candidate, ["check", file], {
            cwd: root,
            encoding: "utf8",
            shell: false,
            stdio: "pipe",
          });
        },
      };
    }
  }

  if (process.platform === "win32") {
    const wslDeno = "$HOME/.deno/bin/deno";
    const result = spawnSync("wsl.exe", ["bash", "-lc", `test -x ${wslDeno} && ${wslDeno} --version`], {
      encoding: "utf8",
      shell: false,
    });
    if (result.status === 0) {
      const wslRoot = toWslPath(root);
      return {
        label: "wsl.exe deno",
        check(file) {
          const relativeFile = relative(root, file).replace(/\\/g, "/");
          return spawnSync("wsl.exe", ["bash", "-lc", `cd ${shellQuote(wslRoot)} && ${wslDeno} check ${shellQuote(relativeFile)}`], {
            encoding: "utf8",
            shell: false,
            stdio: "pipe",
          });
        },
      };
    }
  }
  throw new Error("Deno was not found. Install Deno or set DENO_BIN to the deno executable.");
}

if (!existsSync(functionsDir)) {
  throw new Error(`Missing Supabase functions directory: ${relative(root, functionsDir)}`);
}

const allIndexFiles = walk(functionsDir)
  .filter((path) => path.endsWith(join("", "index.ts")))
  .sort((a, b) => a.localeCompare(b));

const indexFiles = allIndexFiles.filter((path) => {
  if (scope === "all") return true;
  if (scope === "hmrc") return relative(functionsDir, path).replace(/\\/g, "/").startsWith("hmrc-");
  throw new Error(`Unsupported Edge Function check scope: ${scope}`);
});

if (indexFiles.length === 0) {
  throw new Error(`No Supabase Edge Function index.ts files found for scope: ${scope}`);
}

const deno = findDeno();
const failures = [];

console.log(`Checking ${indexFiles.length} Supabase Edge Function(s) with ${deno.label} (scope: ${scope})`);

for (const file of indexFiles) {
  const label = relative(root, file).replace(/\\/g, "/");
  const result = deno.check(file);

  if (result.status === 0) {
    console.log(`ok ${label}`);
  } else {
    failures.push({ label, result });
    console.error(`fail ${label}`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failures.length > 0) {
  console.error(`Edge Function type-check failed: ${failures.length}/${indexFiles.length} function(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`Edge Function type-check passed: ${indexFiles.length}/${indexFiles.length} function(s).`);
}
