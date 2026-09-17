#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

# Embed the exact source base; a dirty working tree is explicitly labelled.
VITE_SOURCE_REVISION="$(git -C "${SITES_PROJECT_ROOT}" rev-parse --verify HEAD)"
if [[ -n "$(git -C "${SITES_PROJECT_ROOT}" status --porcelain)" ]]; then
  VITE_SOURCE_REVISION="${VITE_SOURCE_REVISION}-dirty"
fi
export VITE_SOURCE_REVISION

echo "Running bounded vinext build..."
if ! command -v timeout >/dev/null 2>&1; then
  # Native macOS has no GNU timeout; retain the same bounded build there.
  node "${script_dir}/run-bounded.mjs" \
    "${SITES_BUILD_TIMEOUT:-3m}" "${SITES_BUILD_KILL_AFTER:-10s}" \
    "${vinext}" build
else
  timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
    "${vinext}" build
fi

node "${script_dir}/prune-character-build.mjs"
node "${script_dir}/prune-environment-build.mjs"
