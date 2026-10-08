package com.dangervalley.ripsy
import android.net.Uri

import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

class RipsyFigureCacheModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  override fun getName() = "RipsyFigureCache"
  override fun invalidate() { worker.shutdownNow(); super.invalidate() }
  private fun valid(file: File, hash: String, size: Long): Boolean {
    if (!file.isFile || file.length() != size) return false
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { stream -> val block = ByteArray(16384); while (true) { val n = stream.read(block); if (n < 0) break; digest.update(block, 0, n) } }
    return digest.digest().joinToString("") { "%02x".format(it) } == hash
  }
  @ReactMethod
  fun getAnimation(url: String, hash: String, bytes: Double, promise: Promise) {
    worker.execute {
      var temp: File? = null
      try {
        val uri = URI(url)
        require(uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.userInfo == null)
        require(hash.matches(Regex("[a-f0-9]{64}")) && bytes >= 8 && bytes <= 8388608 && bytes % 1.0 == 0.0)
        val directory = File(reactApplicationContext.filesDir, "figure-cache-v1").apply { mkdirs() }
        val target = File(directory, "$hash.riv")
        if (!valid(target, hash, bytes.toLong())) {
          val connection = uri.toURL().openConnection() as HttpsURLConnection
          connection.connectTimeout = 15000; connection.readTimeout = 30000
          connection.instanceFollowRedirects = false
          temp = File.createTempFile("download-", ".tmp", directory)
          try {
            require(connection.responseCode == 200)
            connection.inputStream.use { input -> temp!!.outputStream().use { out ->
              val buffer = ByteArray(16384); var count = 0L
              while (true) { val n = input.read(buffer); if (n < 0) break; count += n; require(count <= bytes.toLong()); out.write(buffer, 0, n) }
            } }
          } finally { connection.disconnect() }
          require(valid(temp!!, hash, bytes.toLong()))
          require(temp!!.renameTo(target))
        }
        target.setLastModified(System.currentTimeMillis())
        // Bound persistent downloads; free bundled models do not depend on this cache.
        val files = directory.listFiles()?.filter { it.extension == "riv" }?.sortedBy { it.lastModified() } ?: emptyList()
        var total = files.sumOf { it.length() }
        for (file in files) { if (total <= 96L * 1024 * 1024) break; if (file != target) { val size = file.length(); if (file.delete()) total -= size } }
        // Rive's source resolver requires file://, not Java's file:/ URI.
        promise.resolve(Uri.fromFile(target).toString())
      } catch (_: Exception) { promise.reject("FIGURE_DOWNLOAD", "Could not download this fighter. Check your connection and try again.") }
      finally { temp?.delete() }
    }
  }
}
class RipsyFigureCachePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RipsyFigureCacheModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
