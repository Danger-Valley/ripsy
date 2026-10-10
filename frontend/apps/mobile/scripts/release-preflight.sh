#!/usr/bin/env bash

set -uo pipefail

platform="${1:-all}"
if [[ "${platform}" != "ios" && "${platform}" != "android" && "${platform}" != "all" ]]; then
  echo "Usage: $0 [ios|android|all]" >&2
  exit 2
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_directory="$(cd "${script_directory}/.." && pwd)"
source "${script_directory}/load-native-env.sh"
failures=0

pass() {
  echo "PASS  $1"
}

fail() {
  echo "FAIL  $1" >&2
  failures=$((failures + 1))
}

check_file() {
  local path="$1"
  local label="$2"
  if [[ -s "${path}" ]]; then pass "${label}"; else fail "${label}: missing ${path}"; fi
}

if node "${script_directory}/sync-ui-assets.mjs" --check; then
  pass "Native UI artwork copies and gradients"
else
  fail "Native UI artwork copies and gradients"
fi

check_metadata() {
  local directory="$1"
  local label="$2"
  shift 2
  local missing=0
  local filename
  for filename in "$@"; do
    local path="${directory}/${filename}"
    if [[ ! -s "${path}" ]]; then
      echo "      missing ${path}" >&2
      missing=1
    fi
  done
  if [[ "${missing}" -eq 0 ]]; then
    pass "${label} metadata"
  else
    fail "${label} metadata is incomplete"
  fi
}

check_privy_config() {
  if [[ -z "${PRIVY_APP_ID:-}" || -z "${PRIVY_CLIENT_ID:-}" ]]; then
    fail "Privy native app/client IDs: set PRIVY_APP_ID and PRIVY_CLIENT_ID"
    return
  fi

  pass "Privy native app/client IDs"

  local response
  if ! response="$(curl --fail --silent --show-error --max-time 15 \
    "https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}" \
    -H "privy-app-id: ${PRIVY_APP_ID}" \
    -H "privy-client-id: ${PRIVY_CLIENT_ID}" \
    -H "x-native-app-identifier: com.dangervalley.ripsy")"; then
    fail "Privy native app client is unavailable or rejects the configured IDs"
    return
  fi

  if PRIVY_CONFIG_RESPONSE="${response}" PRIVY_EXPECTED_APP_ID="${PRIVY_APP_ID}" node -e '
    const config = JSON.parse(process.env.PRIVY_CONFIG_RESPONSE || "{}");
    process.exit(config.id === process.env.PRIVY_EXPECTED_APP_ID ? 0 : 1);
  '; then
    pass "Privy native app client"
  else
    fail "Privy native app client does not match PRIVY_APP_ID"
  fi

  if PRIVY_CONFIG_RESPONSE="${response}" node -e '
    const config = JSON.parse(process.env.PRIVY_CONFIG_RESPONSE || "{}");
    process.exit(config.email_auth === true ? 0 : 1);
  '; then
    pass "Privy email login"
  else
    fail "Privy email login: enable Email in User Management > Authentication"
  fi

  if PRIVY_CONFIG_RESPONSE="${response}" node -e '
    const config = JSON.parse(process.env.PRIVY_CONFIG_RESPONSE || "{}");
    process.exit(config.allowed_native_app_ids?.includes("com.dangervalley.ripsy") ? 0 : 1);
  '; then
    pass "Privy native app identifier"
  else
    fail "Privy native app identifier: add com.dangervalley.ripsy to the mobile client"
  fi

  if PRIVY_CONFIG_RESPONSE="${response}" node -e '
    const config = JSON.parse(process.env.PRIVY_CONFIG_RESPONSE || "{}");
    process.exit(config.allowed_native_app_url_schemes?.includes("ripsy") ? 0 : 1);
  '; then
    pass "Privy native URL scheme"
  else
    fail "Privy native URL scheme: add ripsy to the mobile client"
  fi
}

check_backend() {
  local response
  if ! response="$(curl --fail --silent --show-error --max-time 15 https://api.ripsy.fun/health)"; then
    fail "Railway health endpoint is unavailable"
    return
  fi
  if HEALTH_RESPONSE="${response}" node -e '
    const health = JSON.parse(process.env.HEALTH_RESPONSE || "{}");
    process.exit(health.ok === true && health.redis === "connected" ? 0 : 1);
  '; then
    pass "Railway backend and Redis"
  else
    fail "Railway backend or Redis is not ready"
  fi
  if HEALTH_RESPONSE="${response}" node -e '
    const health = JSON.parse(process.env.HEALTH_RESPONSE || "{}");
    process.exit(health.push === "configured" ? 0 : 1);
  '; then
    pass "Railway Firebase push credentials"
  else
    fail "Railway Firebase push credentials: /health reports push disabled"
  fi
}

check_shop() {
  local response
  if ! response="$(curl --fail --silent --show-error --max-time 15 https://api.ripsy.fun/shop/catalog)"; then
    fail "Production figure shop catalog is unavailable"
    return
  fi
  if SHOP_CATALOG_RESPONSE="${response}" node "${script_directory}/check-shop-release-catalog.mjs" --check; then
    pass "Mainnet Core figure shop catalog"
  else
    fail "Mainnet shop must expose exclusive fig2 with valid SKR payment, collection and treasury"
  fi
}

check_ios() {
  if node "${script_directory}/check-ios-audio-bridge.mjs" "${mobile_directory}/ios/RipsyMobile/Audio/RipsyAudioModule.inc"; then
    pass "iOS audio bridge argument conversion"
  else
    fail "iOS audio bridge argument conversion"
  fi
  local firebase_plist="${mobile_directory}/ios/RipsyMobile/GoogleService-Info.plist"
  check_file "${firebase_plist}" "iOS Firebase configuration"
  if [[ -s "${firebase_plist}" ]]; then
    local bundle_id
    bundle_id="$(plutil -extract BUNDLE_ID raw "${firebase_plist}" 2>/dev/null || true)"
    if [[ "${bundle_id}" == "com.dangervalley.ripsy" ]]; then
      pass "iOS Firebase bundle ID"
    else
      fail "iOS Firebase bundle ID must be com.dangervalley.ripsy"
    fi
  fi
  if grep -q '<key>aps-environment</key>' "${mobile_directory}/ios/RipsyMobile/RipsyMobile.entitlements"; then
    pass "iOS push entitlement"
  else
    fail "iOS push entitlement"
  fi
  if node "${script_directory}/check-ios-firebase-bootstrap.mjs" "${mobile_directory}/ios/RipsyMobile/AppDelegate.swift"; then
    pass "iOS Firebase startup before React Native"
  else
    fail "iOS Firebase startup before React Native"
  fi
  check_metadata "${mobile_directory}/store/app-store/en-US" "App Store" \
    name.txt subtitle.txt description.txt keywords.txt privacy_url.txt support_url.txt
  local screenshot_count
  screenshot_count="$(find "${mobile_directory}/store/screenshots/ios" -type f -name '*.png' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${screenshot_count}" -ge 1 ]]; then
    pass "App Store screenshots (${screenshot_count})"
  else
    fail "App Store screenshots"
  fi
}

check_android() {
  if node --test "${script_directory}/android-release-optimization.test.mjs"; then
    pass "Android release optimization and R8 mapping archival"
  else
    fail "Android release optimization or R8 mapping archival regressed"
  fi
  local firebase_json="${mobile_directory}/android/app/google-services.json"
  local signing_properties="${mobile_directory}/android/keystore.properties"
  check_file "${firebase_json}" "Android Firebase configuration"
  if [[ -s "${firebase_json}" ]]; then
    if node -e '
      const config = require(process.argv[1]);
      const clients = Array.isArray(config.client) ? config.client : [];
      const valid = clients.some(client => client?.client_info?.android_client_info?.package_name === "com.dangervalley.ripsy");
      process.exit(valid ? 0 : 1);
    ' "${firebase_json}"; then
      pass "Android Firebase application ID"
    else
      fail "Android Firebase application ID must be com.dangervalley.ripsy"
    fi
  fi
  check_file "${signing_properties}" "Android release signing properties"
  if [[ -s "${signing_properties}" ]]; then
    local store_file
    store_file="$(sed -n 's/^storeFile=//p' "${signing_properties}" | tail -1)"
    if [[ -n "${store_file}" && -s "${mobile_directory}/android/${store_file}" ]]; then
      pass "Android upload keystore"
    else
      fail "Android upload keystore referenced by keystore.properties"
    fi
  fi
  check_metadata "${mobile_directory}/store/google-play/en-US" "Google Play" \
    title.txt short-description.txt full-description.txt privacy-policy-url.txt support-url.txt
  local screenshot_count
  screenshot_count="$(find "${mobile_directory}/store/screenshots/android" -type f -name '*.png' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${screenshot_count}" -ge 2 ]]; then
    pass "Google Play screenshots (${screenshot_count})"
  else
    fail "Google Play screenshots: at least 2 are required for release readiness"
  fi
}

check_backend
check_shop
check_privy_config
if node "${mobile_directory}/../../../scripts/check-game-sounds.mjs"; then
  pass "Original game sound pack"
else
  fail "Original game sound pack is missing, stale or invalid"
fi
if [[ "${platform}" == "ios" || "${platform}" == "all" ]]; then check_ios; fi
if [[ "${platform}" == "android" || "${platform}" == "all" ]]; then check_android; fi

if [[ "${failures}" -gt 0 ]]; then
  echo "Release preflight failed with ${failures} issue(s)." >&2
  echo "Set RIPSY_SKIP_RELEASE_PREFLIGHT=1 only for an intentionally incomplete test build." >&2
  exit 1
fi

echo "Release preflight passed for ${platform}."
