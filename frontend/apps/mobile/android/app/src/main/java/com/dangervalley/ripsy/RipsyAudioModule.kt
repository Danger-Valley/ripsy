package com.dangervalley.ripsy

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File

class RipsyAudioModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var pool: SoundPool? = null
  private val samples = mutableMapOf<String, Int>()
  private val streams = mutableMapOf<String, Int>()
  private val files = mutableMapOf<Int, File>()
  private var pending: Promise? = null
  private var active = true
  private var generation = 0
  init { context.addLifecycleEventListener(this) }
  override fun getName() = "RipsyAudio"
  private fun stop() { streams.values.forEach { pool?.stop(it) }; streams.clear() }
  private fun release() {
    generation++
    stop(); pool?.release(); pool = null; samples.clear()
    files.values.forEach { it.delete() }; files.clear()
    pending?.reject("AUDIO_CANCELLED", "Sound loading cancelled"); pending = null
  }
  @ReactMethod
  fun prepare(pack: ReadableMap, promise: Promise) { handler.post {
    release()
    if (pack.toHashMap().size != 13) { promise.reject("AUDIO_LOAD", "Sound pack unavailable"); return@post }
    pending = promise
    val token = generation
    val soundPool = SoundPool.Builder().setMaxStreams(4).setAudioAttributes(
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    ).build()
    pool = soundPool
    var loaded = 0
    soundPool.setOnLoadCompleteListener { _, sample, status -> handler.post callback@{
      if (generation != token || pending == null) return@callback
      files.remove(sample)?.delete()
      if (status != 0) { release(); return@callback }
      loaded++
      if (loaded == 13) { pending?.resolve(true); pending = null }
    } }
    try {
      val keys = pack.keySetIterator()
      while (keys.hasNextKey()) {
        val key = keys.nextKey()
        require(key.matches(Regex("[a-z]{1,16}")))
        val data = Base64.decode(pack.getString(key), Base64.NO_WRAP)
        require(data.size in 44..100000)
        val file = File.createTempFile("ripsy-sound-", ".wav", reactApplicationContext.cacheDir)
        try {
          file.writeBytes(data)
          val id = soundPool.load(file.absolutePath, 1)
          if (id == 0) { file.delete(); error("Sound unavailable") }
          samples[key] = id; files[id] = file
        } catch (error: Exception) { file.delete(); throw error }
      }
    } catch (_: Exception) { release(); return@post }
    handler.postDelayed({ if (generation == token && pending != null) release() }, 5000)
  } }
  @ReactMethod
  fun play(name: String, volume: Double) { handler.post {
    if (!active || !volume.isFinite() || pending != null) return@post
    val audio = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    // Never steal audio focus or play over a phone/voice call.
    if (audio.mode != AudioManager.MODE_NORMAL) return@post
    val id = samples[name] ?: return@post
    streams.remove(name)?.let { pool?.stop(it) }
    val level = volume.coerceIn(0.0, 1.0).toFloat()
    val stream = pool?.play(id, level, level, 1, 0, 1f) ?: 0
    if (stream != 0) streams[name] = stream
  } }
  @ReactMethod fun stopAll() { handler.post { stop() } }
  @ReactMethod fun releaseSounds() { handler.post { release() } }
  override fun onHostPause() { handler.post { active = false; stop() } }
  override fun onHostResume() { handler.post { active = true } }
  override fun onHostDestroy() { handler.post { active = false; release() } }
  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    handler.post { active = false; release(); handler.removeCallbacksAndMessages(null) }
    super.invalidate()
  }
}
