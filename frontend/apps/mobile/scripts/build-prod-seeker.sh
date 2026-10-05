#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
project_directory="$(cd "${mobile_directory}/../../../.." && pwd)"
source "${script_directory}/load-native-env.sh"
version_file="${mobile_directory}/android/version.properties"
output_directory="${mobile_directory}/builds"
shared_output_directory="${RIPSY_SEEKER_BUILD_OUTPUT_DIR:-${project_directory}/files/builds}"

if [[ "${RIPSY_SKIP_RELEASE_PREFLIGHT:-0}" != "1" ]]; then
  "${script_directory}/release-preflight.sh" android
fi

"${script_directory}/bump-build.sh"

version_code="$(sed -n 's/^VERSION_CODE=//p' "${version_file}")"
version_name="$(sed -n 's/^VERSION_NAME=//p' "${version_file}")"

cd "${mobile_directory}/android"
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a

source_apk="${mobile_directory}/android/app/build/outputs/apk/release/app-release.apk"
source_mapping="${mobile_directory}/android/app/build/outputs/mapping/release/mapping.txt"
destination_apk="${output_directory}/Ripsy-v${version_name}(${version_code})-seeker.apk"
shared_destination_apk="${shared_output_directory}/Ripsy-v${version_name}(${version_code})-seeker.apk"

if [[ ! -f "${source_apk}" ]]; then
  echo "Release APK not found: ${source_apk}" >&2
  exit 1
fi
if [[ ! -s "${source_mapping}" ]]; then
  echo "R8 mapping missing; refusing to publish an untraceable release." >&2
  exit 1
fi

mkdir -p "${output_directory}" "${shared_output_directory}"
cp "${source_apk}" "${destination_apk}"
cp "${source_apk}" "${shared_destination_apk}"
cp "${source_mapping}" "${destination_apk%.apk}.mapping.txt"
cp "${source_mapping}" "${shared_destination_apk%.apk}.mapping.txt"

if [[ "${RIPSY_SKIP_SEEKER_PUBLISH:-0}" != "1" ]]; then
  node "${script_directory}/publish-seeker-apk.mjs" "${source_apk}" "${version_name}" "${version_code}"
fi

echo "Seeker APK:        ${destination_apk}"
echo "Shared Seeker APK: ${shared_destination_apk}"
echo "Download page:     https://ripsy.fun/download"
