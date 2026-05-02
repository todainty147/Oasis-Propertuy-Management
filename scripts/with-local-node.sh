#!/usr/bin/env bash
set -euo pipefail

LOCAL_NODE_BIN="${HOME}/.local/nodejs/bin"
NODE_MODULES_BIN="${PWD}/node_modules/.bin"

if [ -d "${LOCAL_NODE_BIN}" ]; then
  export PATH="${LOCAL_NODE_BIN}:${PATH}"
fi

if [ -d "${NODE_MODULES_BIN}" ]; then
  export PATH="${NODE_MODULES_BIN}:${PATH}"
fi

resolve_safe_temp_dir() {
  local candidate
  for candidate in "/tmp" "${TMPDIR:-}" "${TEMP:-}" "${TMP:-}"; do
    if [ -n "${candidate}" ] && [ -d "${candidate}" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  printf '%s\n' "/tmp"
}

SAFE_TEMP_DIR="$(resolve_safe_temp_dir)"
export TMPDIR="${SAFE_TEMP_DIR}"
export TEMP="${SAFE_TEMP_DIR}"
export TMP="${SAFE_TEMP_DIR}"

exec "$@"
