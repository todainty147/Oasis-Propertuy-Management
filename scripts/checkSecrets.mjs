#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ALLOWED_HINTS = [
  "placeholder",
  "redacted",
  "your_",
  "your-",
  "example",
  "dummy",
  "fake",
  "<secret>",
  "<redacted>",
];

const PATTERNS = [
  {
    name: "Supabase JWT-like key",
    regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Supabase sb_secret",
    regex: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    name: "Stripe secret key",
    regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "Stripe webhook secret",
    regex: /\bwhsec_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "OpenAI API key",
    regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b|\bsk-[A-Za-z0-9]{32,}\b/g,
  },
  {
    name: "Anthropic API key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "HMRC client secret assignment",
    regex: /\bHMRC_CLIENT_SECRET\s*=\s*["']?[A-Za-z0-9._~+/=-]{20,}/g,
  },
  {
    name: "Private key block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/g,
  },
];

const SKIP_PATHS = [
  /^package-lock\.json$/,
  /^marketing-site\/package-lock\.json$/,
  /^dist\//,
  /^coverage\//,
  /^node_modules\//,
  /^marketing-site\/node_modules\//,
];

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

function isSkipped(file) {
  return SKIP_PATHS.some((pattern) => pattern.test(file));
}

function isAllowedLine(line) {
  const lowered = line.toLowerCase();
  return ALLOWED_HINTS.some((hint) => lowered.includes(hint));
}

export function scanText(file, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (const pattern of PATTERNS) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      pattern.regex.lastIndex = 0;
      if (!pattern.regex.test(line) || isAllowedLine(line)) continue;
      findings.push({
        file,
        line: index + 1,
        type: pattern.name,
      });
    }
  }

  return findings;
}

export function scanFiles(files = trackedFiles()) {
  const findings = [];

  for (const file of files) {
    if (isSkipped(file)) continue;

    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    if (text.includes("\u0000")) continue;
    findings.push(...scanText(file, text));
  }

  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = scanFiles();
  if (findings.length > 0) {
    console.error("Potential secrets found in tracked files. Values are not printed.");
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} ${finding.type}`);
    }
    process.exit(1);
  }

  console.log("No obvious secrets found in tracked files.");
}
