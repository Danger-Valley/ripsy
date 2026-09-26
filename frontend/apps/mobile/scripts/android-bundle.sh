#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
source "${script_directory}/load-native-env.sh"

if [[ "${RIPSY_SKIP_RELEASE_PREFLIGHT:-0}" != "1" ]]; then
  "${script_directory}/release-preflight.sh" android
fi

cd "${mobile_directory}/android"
./gradlew bundleRelease
