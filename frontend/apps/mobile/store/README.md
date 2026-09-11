# RIPSY store submission notes

The text files in this directory are the source of truth for the first App Store and Google Play listings.

Before submission:

1. Confirm that `https://www.ripsy.fun/privacy` and `https://www.ripsy.fun/support` are deployed.
2. Replace or supplement the public issue tracker with a monitored support email if desired.
3. Capture current phone and tablet screenshots from signed release builds.
4. Complete each store's age/content-rating questionnaire from the actual shipped feature set.
5. Review the privacy answers against the production backend and Firebase configuration.

The app collects anonymous player IDs, gameplay content, and a Firebase installation/device identifier for app functionality. It does not use advertising or cross-app tracking.

## TestFlight delivery

Create the app record for `com.dangervalley.ripsy` in App Store Connect before the first upload. Then export the signing values locally and run:

```sh
export APPLE_TEAM_ID="..."
export APP_STORE_CONNECT_API_KEY_ID="..."
export APP_STORE_CONNECT_API_ISSUER_ID="..."
export APP_STORE_CONNECT_API_KEY_PATH="/absolute/path/to/AuthKey_....p8"
# Optional when the installed profile/certificate use different names:
export RIPSY_IOS_PROVISIONING_PROFILE="RIPSY App Store"
export RIPSY_IOS_SIGNING_CERTIFICATE="Apple Distribution"
npm run ios:beta
```

The command creates a Release archive, exports it with the installed App Store provisioning profile, and uploads it to App Store Connect. It does not store signing credentials in the repository. Increase `CURRENT_PROJECT_VERSION` before each subsequent upload.
