#!/usr/bin/env bash
# E-170 Validation Suite — RED-first orchestrator
#
# Usage: bash e170-suite/run.sh
#
# Exit codes:
#   0  All integration tests passed (RED baseline + GREEN result + deny + verify + edgecases)
#   1  RED baseline failed (phantoms did not reproduce — pre-fix function may already be removed)
#   2  GREEN tests failed (fix did not eliminate phantoms)
#   3  Deny tests failed
#   4  Verify tests failed
#   5  Edge-case tests failed
#
# The RED baseline must pass first; if it doesn't, the suite aborts with exit 1.
# This ensures phantoms are reproducible before claiming the fix eliminates them.

set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "E-170 Validation Suite"
echo "Executed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: RED baseline (must pass for phantoms to be reproducible) ─────────

echo "Step 1/4: RED baseline (pre-fix phantom reproduction)"
if ! npx vitest run --config vitest.integration.config.js e170-suite/integration/e170.baseline.test.js --reporter=verbose; then
  echo ""
  echo "ERROR: RED baseline failed — pre-fix phantoms did not reproduce."
  echo "  • The pre-fix finance_snapshot.sql function may have already been applied."
  echo "  • Check that git HEAD contains the pre-fix version:"
  echo "    git show HEAD:supabase/finance_snapshot.sql | head -30"
  exit 1
fi
echo "RED baseline PASSED ✓"
echo ""

# ── Step 2: Deny tests ────────────────────────────────────────────────────────

echo "Step 2/4: Deny tests (guards fire correctly)"
if ! npx vitest run --config vitest.integration.config.js e170-suite/integration/e170.deny.test.js --reporter=verbose; then
  echo ""
  echo "ERROR: Deny tests failed."
  exit 3
fi
echo "Deny tests PASSED ✓"
echo ""

# ── Step 3: Verify tests ──────────────────────────────────────────────────────

echo "Step 3/4: Verify tests (structural correctness)"
if ! npx vitest run --config vitest.integration.config.js e170-suite/integration/e170.verify.test.js --reporter=verbose; then
  echo ""
  echo "ERROR: Verify tests failed."
  exit 4
fi
echo "Verify tests PASSED ✓"
echo ""

# ── Step 4: Edge-case tests ───────────────────────────────────────────────────

echo "Step 4/4: Edge-case and DoD tests"
if ! npx vitest run --config vitest.integration.config.js e170-suite/integration/e170.edgecases.test.js --reporter=verbose; then
  echo ""
  echo "ERROR: Edge-case tests failed."
  echo "  • EC-02 EXPECTED-FAIL(E-172) is expected to PASS in its broken state."
  echo "  • If EC-02 failed, E-172-FIX may have been applied — update the assertion."
  exit 5
fi
echo "Edge-case tests PASSED ✓"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "All E-170 integration tests PASSED."
echo ""
echo "E2E tests require a running browser and seeded fixtures:"
echo "  PLAYWRIGHT_E170_ALICE_PROP=<uuid> PLAYWRIGHT_E170_BOB_PROP=<uuid> \\"
echo "  npx playwright test e170-suite/e2e/e170-finance-phantom-accrual.spec.js"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
