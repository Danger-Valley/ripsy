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

source_mapping="${mobile_directory}/android/app/build/outputs/mapping/release/mapping.txt"
if [[ ! -s "${source_mapping}" ]]; then
  echo "R8 mapping missing; the release bundle must have a matching mapping." >&2
  exit 1
fi
version_file="${mobile_directory}/android/version.properties"
version_code="${RIPSY_VERSION_CODE:-$(sed -n 's/^VERSION_CODE=//p' "${version_file}")}"
version_name="${RIPSY_VERSION_NAME:-$(sed -n 's/^VERSION_NAME=//p' "${version_file}")}"
mapping_directory="${mobile_directory}/builds"
mkdir -p "${mapping_directory}"
cp "${source_mapping}" "${mapping_directory}/Ripsy-v${version_name}(${version_code})-play.mapping.txt"
