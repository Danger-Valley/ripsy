#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/RipsyMobile.xcarchive" >&2
  exit 1
fi

archive_path="$1"
app_frameworks_path="${archive_path}/Products/Applications/RipsyMobile.app/Frameworks"
archive_dsyms_path="${archive_path}/dSYMs"

if [[ ! -d "${app_frameworks_path}" ]]; then
  echo "Archived app frameworks not found: ${app_frameworks_path}" >&2
  exit 1
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/../../../.." && pwd)"
react_native_path="${repository_root}/node_modules/react-native"
react_native_version="$(node -p "require('${react_native_path}/package.json').version")"
hermes_version="$(sed -n 's/^HERMES_VERSION_NAME=//p' "${react_native_path}/sdks/hermes-engine/version.properties")"

if [[ -z "${hermes_version}" ]]; then
  echo "Unable to determine the Hermes version" >&2
  exit 1
fi

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/ripsy-ios-dsyms.XXXXXX")"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

download_and_extract() {
  local url="$1"
  local destination="$2"
  local archive="${temporary_directory}/$(basename "${url}")"

  echo "Downloading $(basename "${url}")"
  curl --fail --location --silent --show-error --retry 3 "${url}" --output "${archive}"
  mkdir -p "${destination}"
  tar -xzf "${archive}" -C "${destination}"
}

framework_uuids() {
  dwarfdump --uuid "$1" | awk '{print $2}' | sort -u
}

install_dsym() {
  local framework_name="$1"
  local source_dsym="$2"
  local framework_binary="${app_frameworks_path}/${framework_name}.framework/${framework_name}"
  local destination_dsym="${archive_dsyms_path}/${framework_name}.framework.dSYM"
  local binary_uuids
  local dsym_uuids

  if [[ ! -f "${framework_binary}" ]]; then
    echo "Archived framework binary not found: ${framework_binary}" >&2
    exit 1
  fi

  if [[ ! -d "${source_dsym}" ]]; then
    echo "Downloaded dSYM not found: ${source_dsym}" >&2
    exit 1
  fi

  rm -rf "${destination_dsym}"
  ditto "${source_dsym}" "${destination_dsym}"

  binary_uuids="$(framework_uuids "${framework_binary}")"
  dsym_uuids="$(framework_uuids "${destination_dsym}")"

  while IFS= read -r binary_uuid; do
    if [[ -n "${binary_uuid}" ]] && ! grep -Fqx "${binary_uuid}" <<< "${dsym_uuids}"; then
      echo "dSYM UUID mismatch for ${framework_name}: ${binary_uuid} is missing" >&2
      exit 1
    fi
  done <<< "${binary_uuids}"

  echo "Installed and verified ${framework_name}.framework.dSYM (${binary_uuids//$'\n'/, })"
}

hermes_directory="${temporary_directory}/hermes"
dependencies_directory="${temporary_directory}/dependencies"
react_directory="${temporary_directory}/react"

download_and_extract \
  "https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${hermes_version}/hermes-ios-${hermes_version}-hermes-framework-dSYM-release.tar.gz" \
  "${hermes_directory}"
download_and_extract \
  "https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/${react_native_version}/react-native-artifacts-${react_native_version}-reactnative-dependencies-dSYM-release.tar.gz" \
  "${dependencies_directory}"
download_and_extract \
  "https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/${react_native_version}/react-native-artifacts-${react_native_version}-reactnative-core-dSYM-release.tar.gz" \
  "${react_directory}"

mkdir -p "${archive_dsyms_path}"
install_dsym "hermesvm" "${hermes_directory}/iphoneos/hermesvm.framework.dSYM"
install_dsym "ReactNativeDependencies" "${dependencies_directory}/ios-arm64/ReactNativeDependencies.framework.dSYM"
install_dsym "React" "${react_directory}/ios-arm64/React.framework.dSYM"
