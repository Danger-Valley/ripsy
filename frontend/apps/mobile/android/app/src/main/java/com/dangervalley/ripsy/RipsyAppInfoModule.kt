package com.dangervalley.ripsy

import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.uimanager.ViewManager

/** Native metadata, never a JS hardcoded build number. Installer is routing, not authentication. */
class RipsyAppInfoModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RipsyAppInfo"
  override fun getConstants(): Map<String, Any> {
    val context = reactApplicationContext
    val installer = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
      } else {
        @Suppress("DEPRECATION")
        context.packageManager.getInstallerPackageName(context.packageName)
      }
    } catch (_: Exception) { null }
    return mapOf("buildNumber" to BuildConfig.VERSION_CODE.toString(),
      "version" to BuildConfig.VERSION_NAME, "installer" to (installer ?: ""))
  }
}

class RipsyAppInfoPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(RipsyAppInfoModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
