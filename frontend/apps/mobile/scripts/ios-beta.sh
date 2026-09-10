#!/usr/bin/env bash

set -euo pipefail

required_variables=(
  APPLE_TEAM_ID
  APP_STORE_CONNECT_API_KEY_ID
  APP_STORE_CONNECT_API_ISSUER_ID
  APP_STORE_CONNECT_API_KEY_PATH
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required environment variable: ${variable_name}" >&2
    exit 1
  fi
done

if [[ ! -f "${APP_STORE_CONNECT_API_KEY_PATH}" ]]; then
  echo "App Store Connect API key not found: ${APP_STORE_CONNECT_API_KEY_PATH}" >&2
  exit 1
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
archive_path="${RIPSY_IOS_ARCHIVE_PATH:-${TMPDIR:-/tmp}/RipsyMobile.xcarchive}"
export_path="${RIPSY_IOS_EXPORT_PATH:-${TMPDIR:-/tmp}/RipsyMobileExport}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/ripsy-ios-beta.XXXXXX")"
export_options_path="${temporary_directory}/ExportOptions.plist"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

sed "s/__APPLE_TEAM_ID__/${APPLE_TEAM_ID}/g" > "${export_options_path}" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>teamID</key>
  <string>__APPLE_TEAM_ID__</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
PLIST

xcodebuild \
  -workspace "${mobile_directory}/ios/RipsyMobile.xcworkspace" \
  -scheme RipsyMobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${archive_path}" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "${APP_STORE_CONNECT_API_KEY_PATH}" \
  -authenticationKeyID "${APP_STORE_CONNECT_API_KEY_ID}" \
  -authenticationKeyIssuerID "${APP_STORE_CONNECT_API_ISSUER_ID}" \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "${archive_path}" \
  -exportPath "${export_path}" \
  -exportOptionsPlist "${export_options_path}" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "${APP_STORE_CONNECT_API_KEY_PATH}" \
  -authenticationKeyID "${APP_STORE_CONNECT_API_KEY_ID}" \
  -authenticationKeyIssuerID "${APP_STORE_CONNECT_API_ISSUER_ID}"

