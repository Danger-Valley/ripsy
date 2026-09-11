#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
version_file="${mobile_directory}/android/version.properties"
ios_project="${mobile_directory}/ios/RipsyMobile.xcodeproj/project.pbxproj"

current_build="$(sed -n 's/^VERSION_CODE=//p' "${version_file}")"

if [[ ! "${current_build}" =~ ^[0-9]+$ ]]; then
  echo "Unable to read VERSION_CODE from ${version_file}" >&2
  exit 1
fi

requested_build="${1:-}"
if [[ -n "${requested_build}" ]]; then
  if [[ ! "${requested_build}" =~ ^[1-9][0-9]*$ ]]; then
    echo "Build number must be a positive integer" >&2
    exit 1
  fi
  next_build="${requested_build}"
else
  next_build="$((current_build + 1))"
fi

sed -i '' "s/^VERSION_CODE=.*/VERSION_CODE=${next_build}/" "${version_file}"
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9][0-9]*/CURRENT_PROJECT_VERSION = ${next_build}/g" "${ios_project}"

echo "Build number: ${current_build} -> ${next_build} (Android and iOS)"
