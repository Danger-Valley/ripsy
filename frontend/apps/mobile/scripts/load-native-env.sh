#!/usr/bin/env bash

# Load only public native SDK identifiers. Never source the entire root .env:
# it also contains Railway-only RPC and mint-authority secrets that must not be
# inherited by Xcode, Gradle, Metro, or arbitrary build hooks.
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_directory="$(cd "${script_directory}/../../../.." && pwd)"
environment_file="${RIPSY_ENV_FILE:-${project_directory}/.env}"

read_public_value() {
  local variable_name="$1"
  node --env-file="${environment_file}" -e 'process.stdout.write(process.env[process.argv[1]] || "")' "${variable_name}"
}

if [[ -f "${environment_file}" ]]; then
  if [[ -z "${PRIVY_APP_ID:-}" ]]; then
    PRIVY_APP_ID="$(read_public_value PRIVY_APP_ID)"
    export PRIVY_APP_ID
  fi
  if [[ -z "${PRIVY_CLIENT_ID:-}" ]]; then
    PRIVY_CLIENT_ID="$(read_public_value PRIVY_CLIENT_ID)"
    export PRIVY_CLIENT_ID
  fi
fi
