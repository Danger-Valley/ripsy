#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
project_directory="$(cd "${mobile_directory}/../../../.." && pwd)"
version_file="${mobile_directory}/android/version.properties"
output_directory="${mobile_directory}/builds"
shared_output_directory="${RIPSY_SEEKER_BUILD_OUTPUT_DIR:-${project_directory}/files/builds}"

"${script_directory}/bump-build.sh"
"${script_directory}/release-preflight.sh" android

version_code="$(sed -n 's/^VERSION_CODE=//p' "${version_file}")"
version_name="$(sed -n 's/^VERSION_NAME=//p' "${version_file}")"

cd "${mobile_directory}/android"
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a

source_apk="${mobile_directory}/android/app/build/outputs/apk/release/app-release.apk"
destination_apk="${output_directory}/Ripsy-v${version_name}(${version_code})-seeker.apk"
shared_destination_apk="${shared_output_directory}/Ripsy-v${version_name}(${version_code})-seeker.apk"

if [[ ! -f "${source_apk}" ]]; then
  echo "Release APK not found: ${source_apk}" >&2
  exit 1
fi

mkdir -p "${output_directory}" "${shared_output_directory}"
cp "${source_apk}" "${destination_apk}"
cp "${source_apk}" "${shared_destination_apk}"

echo "Seeker APK:        ${destination_apk}"
echo "Shared Seeker APK: ${shared_destination_apk}"
