# Launcher icons

Android 26+ uses `ic_launcher_adaptive` / `ic_launcher_round_adaptive`, not the legacy PNG directly. Both XML resources let the launcher apply its own round/squircle mask without wrapping a small square in a white compatibility plate.

The original, opaque, full-square `ic_launcher.png` remains the artwork source at each density. Its foreground is inset 18/108 (16.666667%) on each side of the adaptive layer, placing the original image across the entire 72/108 visible viewport. There is no second padding or pre-rounded PNG. A blue background sampled from the artwork covers layer motion/edge sampling. Do not inset the image further or use the transparent-corner `ic_launcher_round.png` as the adaptive foreground.

Keep the adaptive IDs separate from the raster IDs: pre-26 aliases use the legacy PNGs, and `drawable/launch_screen.xml` still decodes the raster `ic_launcher`. Pointing that bitmap at adaptive XML can break launch-screen inflation. iOS, web, original images and Android splash styling are unchanged.

Reference geometry: [Android AdaptiveIconDrawable](https://developer.android.com/reference/android/graphics/drawable/AdaptiveIconDrawable).

Verification: run `android-launcher-icon.test.ts` and `./gradlew :app:processReleaseResources --offline`. Before release signoff, install the new APK on a physical Seeker and inspect the home screen/app drawer and Android launch screen. A source change does not update an already installed APK; launcher caching may delay the visual update. Do not uninstall the app just to refresh an icon, because that would remove local app data.

2026-10-08 source verification: all 501 mobile tests, mobile TypeScript and focused ESLint pass. Release resource linking succeeds; AAPT2 inspection of the newly linked proto-format resources confirms both manifest entries select the adaptive IDs, their API-26 variants exist and the foreground references the original raster. No new APK was published or installed, and physical Seeker appearance is not yet verified.
