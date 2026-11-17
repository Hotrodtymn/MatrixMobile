package expo.modules.heymatrix

import android.Manifest
import android.annotation.SuppressLint
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.k2fsa.sherpa.onnx.*
import kotlin.concurrent.thread

// Intentionally process-local: after process death the only truthful state is OFF.
object HeyMatrixRuntime {
  @Volatile var occupied = false
  @Volatile var state = "stopped"
    private set
  private var message = "Hey Matrix is off."
  private var detections = 0
  @Synchronized fun update(value: String, detail: String) { state = value; message = detail }
  @Synchronized fun detected() { detections++ }
  @Synchronized fun snapshot(): Map<String, Any> = mapOf("state" to state, "message" to message, "detections" to detections, "occupied" to occupied)
}

class StopListeningReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { HeyMatrixService.stop(context) }
}

class HeyMatrixService : Service() {
  companion object {
    const val CHANNEL = "matrix-hey-listening"
    private const val NOTIFICATION = 8201
    fun stop(context: Context) {
      if (HeyMatrixRuntime.state !in listOf("stopped", "error")) HeyMatrixRuntime.update("stopping", "Releasing microphone…")
      if (!context.stopService(Intent(context, HeyMatrixService::class.java))) HeyMatrixRuntime.update("stopped", "Hey Matrix is off.")
    }
  }
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var running = false
  @Volatile private var recorder: AudioRecord? = null
  private var worker: Thread? = null
  private val captureLock = Any()
  private var wakeLock: PowerManager.WakeLock? = null
  private var tone: ToneGenerator? = null
  private lateinit var audio: AudioManager
  private var focusRequest: AudioFocusRequest? = null
  private var terminalError = false
  @Volatile private var destroyed = false
  @Volatile private var cleanedUp = false
  private var cleanupDelivered = false
  private val healthCheck = object : Runnable {
    override fun run() {
      if (!running) return
      val manager = getSystemService(NotificationManager::class.java)
      if (ContextCompat.checkSelfPermission(this@HeyMatrixService, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
        !manager.areNotificationsEnabled() || manager.getNotificationChannel(CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE) {
        fail("Microphone permission or listening notifications were disabled. Open Matrix to enable again.")
      } else main.postDelayed(this, 1000)
    }
  }
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0) tone?.stopTone()
  }
  private val recordingCallback = object : AudioManager.AudioRecordingCallback() {
    override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
      if (Build.VERSION.SDK_INT >= 29 && configs.any { it.isClientSilenced }) fail("Microphone interrupted by Android or another app. Open Matrix to restart.")
    }
  }
  private val playbackCallback = object : AudioManager.AudioPlaybackCallback() {
    override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
      if (configs.any { it.audioAttributes.usage == AudioAttributes.USAGE_ALARM }) fail("Listening stopped for an alarm. Open Matrix to restart.")
    }
  }
  override fun onBind(intent: Intent?) = null
  override fun onCreate() {
    super.onCreate()
    audio = getSystemService(AudioManager::class.java)
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL, "Hey Matrix listening", NotificationManager.IMPORTANCE_LOW).apply {
        description = "On-device microphone listening controls"; setSound(null, null)
      })
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Never restart a microphone session from a null/sticky system delivery.
    if (intent == null) { stopSelf(); return START_NOT_STICKY }
    if (worker != null) return START_NOT_STICKY
    try {
      check(ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Microphone permission was removed." }
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification("Starting on-device listening…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(NOTIFICATION, notification("Starting on-device listening…"))
      running = true
      main.post(healthCheck)
      audio.registerAudioPlaybackCallback(playbackCallback, main)
      worker = thread(name = "HeyMatrixAudio") { listen() }
    } catch (error: Exception) { fail(error.message ?: "Android blocked microphone startup.") }
    return START_NOT_STICKY
  }
  private fun notification(detail: String): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)!!.apply { addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP) }
    val openIntent = PendingIntent.getActivity(this, 8202, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stopIntent = PendingIntent.getBroadcast(this, 8203, Intent(this, StopListeningReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Hey Matrix")
      .setContentText(detail).setOngoing(true).setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setContentIntent(openIntent)
      .addAction(android.R.drawable.ic_media_pause, "Stop Listening", stopIntent)
      .addAction(android.R.drawable.ic_menu_view, "Open Matrix", openIntent).build()
  }
  private fun publish(state: String, detail: String) {
    main.post {
      if (running && !terminalError) {
        HeyMatrixRuntime.update(state, detail)
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification(detail))
      }
    }
  }
  @SuppressLint("WakelockTimeout", "MissingPermission")
  private fun listen() {
    var kws: KeywordSpotter? = null
    var stream: OnlineStream? = null
    var localRecorder: AudioRecord? = null
    try {
      val prefix = "hey-matrix/"
      kws = KeywordSpotter(assets, KeywordSpotterConfig(
        modelConfig = OnlineModelConfig(transducer = OnlineTransducerModelConfig(
          encoder = prefix + "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
          decoder = prefix + "decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
          joiner = prefix + "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
          tokens = prefix + "tokens.txt", modelType = "zipformer2", numThreads = 1),
        keywordsFile = prefix + "keywords.txt"))
      stream = kws.createStream()
      if (!running) return
      val buffer = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      check(buffer > 0) { "16 kHz mono microphone capture is unavailable." }
      val record = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(buffer * 2, 6400))
      localRecorder = record
      recorder = record
      check(record.state == AudioRecord.STATE_INITIALIZED) { "Could not initialize microphone." }
      if (Build.VERSION.SDK_INT >= 29) record.registerAudioRecordingCallback(mainExecutor, recordingCallback)
      if (!running) return
      wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Matrix:HeyMatrix").apply { acquire(8 * 60 * 60 * 1000L) }
      main.postDelayed({ if (running) fail("Eight-hour listening session ended. Open Matrix to enable again.") }, 8 * 60 * 60 * 1000L)
      synchronized(captureLock) {
        if (!running) return
        record.startRecording()
      }
      check(record.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Could not start microphone capture." }
      publish("listening", "Listening on device for Hey Matrix")
      val policy = WakePolicy()
      val samples = ShortArray(1600)
      var wasCooling = false
      while (running) {
        if (audio.mode != AudioManager.MODE_NORMAL) { fail("Listening stopped for a call or audio interruption. Open Matrix to restart."); break }
        val count = record.read(samples, 0, samples.size)
        if (!running) break
        check(count > 0) { "Microphone capture failed ($count). Open Matrix to restart." }
        val now = SystemClock.elapsedRealtime()
        if (policy.coolingDown(now)) { wasCooling = true; continue }
        if (wasCooling) { kws.reset(stream); publish("listening", "Listening on device for Hey Matrix"); wasCooling = false }
        stream.acceptWaveform(FloatArray(count) { samples[it] / 32768.0f }, 16000)
        while (running && kws.isReady(stream)) {
          kws.decode(stream)
          if (kws.getResult(stream).keyword.isNotEmpty()) {
            kws.reset(stream)
            if (policy.accept(SystemClock.elapsedRealtime())) {
              HeyMatrixRuntime.detected()
              publish("cooldown", "Heard Hey Matrix — cooldown")
              main.post { if (running) acknowledge() }
            }
            break
          }
        }
      }
    } catch (error: Throwable) {
      if (running) fail("Wake listening failed: ${error.message ?: error.javaClass.simpleName}")
    } finally {
      if (Build.VERSION.SDK_INT >= 29) runCatching { localRecorder?.unregisterAudioRecordingCallback(recordingCallback) }
      runCatching { localRecorder?.stop() }; runCatching { localRecorder?.release() }; recorder = null
      runCatching { stream?.release() }; runCatching { kws?.release() }
      runCatching { wakeLock?.let { if (it.isHeld) it.release() } }; wakeLock = null
      cleanedUp = true
      main.post {
        cleanupDelivered = true
        if (destroyed) {
          HeyMatrixRuntime.occupied = false
          if (!terminalError) HeyMatrixRuntime.update("stopped", "Hey Matrix is off.")
        } else stopSelf()
      }
    }
  }
  private fun acknowledge() {
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener).build()
    val granted = audio.requestAudioFocus(focusRequest!!) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (granted) {
      runCatching { tone = ToneGenerator(AudioManager.STREAM_MUSIC, 45); tone?.startTone(ToneGenerator.TONE_PROP_ACK, 160) }
    }
    main.postDelayed({ tone?.release(); tone = null; focusRequest?.let { audio.abandonAudioFocusRequest(it) }; focusRequest = null }, 250)
  }
  private fun fail(detail: String) {
    main.post {
      if (!destroyed && ((!terminalError && running) || HeyMatrixRuntime.state == "starting")) {
        terminalError = true; HeyMatrixRuntime.update("error", detail); stopSelf()
      }
    }
  }
  override fun onDestroy() {
    destroyed = true
    main.removeCallbacks(healthCheck)
    synchronized(captureLock) {
      running = false
      runCatching { recorder?.stop() }
    }
    audio.unregisterAudioPlaybackCallback(playbackCallback)
    // Stop above unblocks read; only the worker releases the recorder/model.
    tone?.release(); tone = null
    focusRequest?.let { audio.abandonAudioFocusRequest(it) }; focusRequest = null
    if (worker == null || (cleanedUp && cleanupDelivered)) {
      HeyMatrixRuntime.occupied = false
      if (!terminalError) HeyMatrixRuntime.update("stopped", "Hey Matrix is off.")
    } else if (!terminalError) HeyMatrixRuntime.update("stopping", "Releasing microphone…")
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
