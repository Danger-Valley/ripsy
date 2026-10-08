#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_directory}/load-native-env.sh"

required_variables=(
  APPLE_TEAM_ID
  APP_STORE_CONNECT_API_KEY_ID
  APP_STORE_CONNECT_API_ISSUER_ID
  APP_STORE_CONNECT_API_KEY_PATH
  PRIVY_APP_ID
  PRIVY_CLIENT_ID
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

mobile_directory="$(cd "${script_directory}/.." && pwd)"
node "${script_directory}/sync-ui-assets.mjs"

if [[ "${RIPSY_SKIP_RELEASE_PREFLIGHT:-0}" != "1" ]]; then
  "${script_directory}/release-preflight.sh" ios
fi

archive_path="${RIPSY_IOS_ARCHIVE_PATH:-${TMPDIR:-/tmp}/RipsyMobile.xcarchive}"
export_path="${RIPSY_IOS_EXPORT_PATH:-${TMPDIR:-/tmp}/RipsyMobileExport}"
distribution_profile="${RIPSY_IOS_PROVISIONING_PROFILE:-RIPSY App Store}"
distribution_certificate="${RIPSY_IOS_SIGNING_CERTIFICATE:-Apple Distribution}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/ripsy-ios-beta.XXXXXX")"
export_options_path="${temporary_directory}/ExportOptions.plist"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

sed \
  -e "s|__APPLE_TEAM_ID__|${APPLE_TEAM_ID}|g" \
  -e "s|__DISTRIBUTION_PROFILE__|${distribution_profile}|g" \
  -e "s|__DISTRIBUTION_CERTIFICATE__|${distribution_certificate}|g" \
  > "${export_options_path}" <<'PLIST'
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
  <string>manual</string>
  <key>signingCertificate</key>
  <string>__DISTRIBUTION_CERTIFICATE__</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.dangervalley.ripsy</key>
    <string>__DISTRIBUTION_PROFILE__</string>
  </dict>
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
  PRIVY_APP_ID="${PRIVY_APP_ID}" \
  PRIVY_CLIENT_ID="${PRIVY_CLIENT_ID}" \
  archive

"${script_directory}/install-react-native-dsyms.sh" "${archive_path}"

xcodebuild \
  -exportArchive \
  -archivePath "${archive_path}" \
  -exportPath "${export_path}" \
  -exportOptionsPlist "${export_options_path}" \
  -authenticationKeyPath "${APP_STORE_CONNECT_API_KEY_PATH}" \
  -authenticationKeyID "${APP_STORE_CONNECT_API_KEY_ID}" \
  -authenticationKeyIssuerID "${APP_STORE_CONNECT_API_ISSUER_ID}"
