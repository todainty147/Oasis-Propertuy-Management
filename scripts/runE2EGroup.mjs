import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const GROUPS = {
  hmrc: {
    workers: 2,
    files: [
      "tests/e2e/hmrc-phase5d-pilot.spec.js",
      "tests/e2e/hmrc-phase5d-dependency-paths.spec.js",
    ],
  },
  "core-shell": {
    workers: 2,
    files: [
      "tests/e2e/app-shell.spec.js",
      "tests/e2e/shell-redesign.spec.js",
      "tests/e2e/role-navigation-permissions.spec.js",
      "tests/e2e/invite-acceptance-flow.spec.js",
      "tests/e2e/root-invitations-flow.spec.js",
      "tests/e2e/tenant-restrictions-flow.spec.js",
      "tests/e2e/security-audit-investigation.spec.js",
      "tests/e2e/responsive-accessibility-release.spec.js",
    ],
  },
  finance: {
    workers: 2,
    files: [
      "tests/e2e/finance-calculations.spec.js",
      "tests/e2e/finance-mobile-responsive.spec.js",
      "tests/e2e/finance-payment-lifecycle.spec.js",
      "tests/e2e/finance.spec.js",
      "tests/e2e/rent-plans.spec.js",
    ],
  },
  documents: {
    workers: 2,
    files: [
      "tests/e2e/document-requests-flow.spec.js",
      "tests/e2e/document-packets-flow.spec.js",
      "tests/e2e/document-template-library.spec.js",
      "tests/e2e/poland-evidence-flow.spec.js",
    ],
  },
  notifications: {
    workers: 1,
    files: [
      "tests/e2e/notifications.spec.js",
      "tests/e2e/notification-coverage.spec.js",
    ],
  },
  maintenance: {
    workers: 2,
    files: [
      "tests/e2e/maintenance-inbox-redesign.spec.js",
      "tests/e2e/maintenance-work-order-flow.spec.js",
      "tests/e2e/operating-calendar.spec.js",
    ],
  },
  poland: {
    workers: 1,
    files: [
      "tests/e2e/poland-compliance-flow.spec.js",
      "tests/e2e/poland-compliance-security-routes.spec.js",
      "tests/e2e/poland-evidence-flow.spec.js",
    ],
  },
  screenshots: {
    workers: 1,
    files: [
      "tests/e2e/compliance-screenshots.spec.js",
      "tests/e2e/marketing-screenshots.spec.js",
      "tests/e2e/linkedin-product-shots.spec.js",
    ],
  },
  ai: {
    workers: 2,
    files: [
      "tests/e2e/ai-surface-robustness.spec.js",
      "tests/e2e/command-center-ai.spec.js",
      "tests/e2e/maintenance-inbox-ai.spec.js",
      "tests/e2e/contractor-recommendation-ai.spec.js",
      "tests/e2e/portfolio-health-ai.spec.js",
      "tests/e2e/weekly-portfolio-ai.spec.js",
    ],
  },
  signup: {
    workers: 1,
    files: [
      "tests/e2e/self-serve-signup.spec.js",
      "tests/e2e/self-serve-signup-flow.spec.js",
      "tests/e2e/password-policy-ui.spec.js",
    ],
  },
};

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
      env,
    });

    child.on("error", (error) => {
      console.error(error?.message || error);
      resolve(1);
    });

    child.on("close", (code) => resolve(code ?? 1));
  });
}

const groupName = process.argv[2];
const group = GROUPS[groupName];

if (!group) {
  console.error(`Unknown E2E group: ${groupName || "(missing)"}`);
  console.error(`Available groups: ${Object.keys(GROUPS).join(", ")}`);
  process.exitCode = 2;
} else {
  mkdirSync("tmp", { recursive: true });
  const artifact = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || `tmp/e2e-${groupName}.json`;
  const classification = process.env.PLAYWRIGHT_CLASSIFICATION_OUTPUT || `tmp/e2e-${groupName}-classification.json`;
  const args = [
    "scripts/runPlaywright.mjs",
    "test",
    ...group.files,
    "--reporter=json",
    `--workers=${group.workers}`,
  ];

  console.log(`[e2e-group] ${groupName}: ${group.files.length} file(s), workers=${group.workers}`);
  console.log(`[e2e-group] JSON artifact: ${artifact}`);

  const code = await run(process.execPath, args, {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: artifact,
    PLAYWRIGHT_CLASSIFICATION_OUTPUT: classification,
  });

  process.exitCode = code;
}
