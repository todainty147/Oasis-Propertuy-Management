#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat || true)"
COMMAND=""

if [[ -n "${INPUT}" ]]; then
  if command -v node >/dev/null 2>&1; then
    COMMAND="$(printf '%s' "${INPUT}" | node <<'EOF'
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(raw);
    const command =
      parsed?.tool_input?.command ??
      parsed?.command ??
      parsed?.input?.command ??
      "";
    process.stdout.write(String(command || ""));
  } catch {
    process.stdout.write(String(raw || "").trim());
  }
});
EOF
)"
  else
    COMMAND="$(printf '%s' "${INPUT}" | sed -nE 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
    if [[ -z "${COMMAND}" ]]; then
      COMMAND="$(printf '%s' "${INPUT}")"
    fi
  fi
fi

COMMAND="${COMMAND//$'\r'/}"

DANGEROUS_PATTERNS=(
  '(^|[[:space:]])git[[:space:]]+push([[:space:]]|$)'
  '(^|[[:space:]])git[[:space:]]+reset[[:space:]]+--hard([[:space:]]|$)'
  '(^|[[:space:]])git[[:space:]]+clean[[:space:]]+-fd([[:space:]]|$)'
  '(^|[[:space:]])git[[:space:]]+clean[[:space:]]+-f([[:space:]]|$)'
  '(^|[[:space:]])git[[:space:]]+branch[[:space:]]+-D([[:space:]]|$)'
  '(^|[[:space:]])git[[:space:]]+checkout[[:space:]]+\.([[:space:]]|$)'
  '(^|[[:space:]])git[[:space:]]+restore[[:space:]]+\.([[:space:]]|$)'
  '(^|[[:space:]])push[[:space:]]+--force([[:space:]]|$)'
  '(^|[[:space:]])push[[:space:]]+--force-with-lease([[:space:]]|$)'
  '(^|[[:space:]])reset[[:space:]]+--hard([[:space:]]|$)'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if printf '%s\n' "${COMMAND}" | grep -qE -- "${pattern}"; then
    echo "BLOCKED: '${COMMAND}' matches dangerous Git pattern '${pattern}'." >&2
    echo "Use a reviewed PR workflow or remove the guard intentionally if you truly need this action." >&2
    exit 2
  fi
done

exit 0
