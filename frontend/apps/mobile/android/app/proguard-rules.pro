# Release uses R8 with proguard-android-optimize.txt plus SDK consumer rules.
# React Native retains NativeModule/@ReactMethod bridge entry points; Nitro
# generated JNI classes use @Keep/@DoNotStrip; Rive supplies runtime keep rules.
# Prefer specific rules for demonstrated reflection/JNI issues, not blanket
# -keep or -dontwarn for entire SDKs (which hides failures/defeats shrinking).
# Archive build/outputs/mapping/release alongside each published APK/AAB so
# obfuscated production stack traces can be retraced with the matching mapping.
