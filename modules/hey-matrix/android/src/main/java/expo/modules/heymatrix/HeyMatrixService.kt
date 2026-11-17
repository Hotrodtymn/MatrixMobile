package expo.modules.heymatrix

import android.Manifest
import android.annotation.SuppressLint
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import android.util.Log
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
  val diagnostics = WakeDiagnostics()
  @Volatile var voicePhase = VoicePhase.PASSIVE_WAKE.name
  @Volatile var voiceStatus = "Commands require Matrix visible and unlocked."
  fun log(event: String) { Log.i("HeyMatrix", event) }
  @Synchronized fun update(value: String, detail: String) { state = value; message = detail }
  @Synchronized fun detected() { detections++; diagnostics.detected(System.currentTimeMillis()); log("wake_detected") }
  @Synchronized fun snapshot(): Map<String, Any> = mapOf("state" to state, "message" to message, "detections" to detections, "occupied" to occupied, "diagnostics" to diagnostics.snapshot(), "voicePhase" to voicePhase, "voiceStatus" to voiceStatus)
}

class StopListeningReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { HeyMatrixService.stop(context) }
}

class HeyMatrixService : Service() {
  companion object {
    const val CHANNEL = "matrix-hey-listening"
    private const val NOTIFICATION = 8201
    private var activeInstance: HeyMatrixService? = null
    fun testTone() {
      val service = activeInstance ?: error("Enable Hey Matrix before testing the tone.")
      check(service.running && VoiceCommandCycle.active == null) { "Test tone is available only during passive wake monitoring." }
      service.acknowledge()
    }
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
      VoiceCommandCycle.active?.checkHost()
      if (VoiceCommandCycle.active != null) getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification("Voice reminder: " + HeyMatrixRuntime.voicePhase))
      val manager = getSystemService(NotificationManager::class.java)
      if (ContextCompat.checkSelfPermission(this@HeyMatrixService, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
        !manager.areNotificationsEnabled() || manager.getNotificationChannel(CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE) {
        fail("Microphone permission or listening notifications were disabled. Open Matrix to enable again.", "ACCESS_REMOVED")
      } else main.postDelayed(this, 1000)
    }
  }
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0) {
      tone?.stopTone()
      HeyMatrixRuntime.diagnostics.tone("Playback interrupted by audio focus loss")
      HeyMatrixRuntime.log("tone_focus_lost")
    }
  }
  private val recordingCallback = object : AudioManager.AudioRecordingCallback() {
    override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
      if (recorder != null && Build.VERSION.SDK_INT >= 29 && configs.any { it.isClientSilenced }) fail("Microphone interrupted by Android or another app. Open Matrix to restart.", "MIC_SILENCED")
    }
  }
  private val playbackCallback = object : AudioManager.AudioPlaybackCallback() {
    override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
      if (configs.any { it.audioAttributes.usage == AudioAttributes.USAGE_ALARM }) fail("Listening stopped for an alarm. Open Matrix to restart.", "ALARM_ACTIVE")
    }
  }
  override fun onBind(intent: Intent?) = null
  override fun onCreate() {
    super.onCreate()
    activeInstance = this
    HeyMatrixRuntime.log("service_created")
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
      HeyMatrixRuntime.diagnostics.service(true)
      HeyMatrixRuntime.diagnostics.stage("service_started")
      HeyMatrixRuntime.log("service_foreground_started")
      main.post(healthCheck)
      audio.registerAudioPlaybackCallback(playbackCallback, main)
      startPassive()
    } catch (error: Exception) { fail(error.message ?: "Android blocked microphone startup.") }
    return START_NOT_STICKY
  }
  private fun startPassive() {
    if (!running || destroyed) return
    cleanedUp = false; cleanupDelivered = false
    HeyMatrixRuntime.voicePhase = VoicePhase.PASSIVE_WAKE.name
    worker = thread(name = "HeyMatrixAudio") { listen() }
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
    var handoff = false
    try {
      HeyMatrixRuntime.diagnostics.stage("checking_assets")
      WakeModel.verifyAssets(assets)
      HeyMatrixRuntime.log("assets_verified sample_rate=16000 feature_dim=80 phrase_count=1 effective_threshold=0.35 boost=1.5")
      HeyMatrixRuntime.diagnostics.stage("loading_model")
      kws = KeywordSpotter(assets, WakeModel.config())
      stream = kws.createStream()
      HeyMatrixRuntime.diagnostics.model(true)
      HeyMatrixRuntime.log("model_loaded stream_created")
      HeyMatrixRuntime.diagnostics.stage("starting_microphone")
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
      main.postDelayed({ if (running) fail("Eight-hour listening session ended. Open Matrix to enable again.", "SESSION_LIMIT") }, 8 * 60 * 60 * 1000L)
      synchronized(captureLock) {
        if (!running) return
        record.startRecording()
      }
      check(record.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Could not start microphone capture." }
      HeyMatrixRuntime.diagnostics.microphone(true)
      HeyMatrixRuntime.diagnostics.stage("listening")
      HeyMatrixRuntime.log("microphone_active sample_rate=${record.sampleRate} audio_source=${record.audioSource}")
      publish("listening", "Listening on device for Hey Matrix")
      val policy = WakePolicy()
      val samples = ShortArray(1600)
      var wasCooling = false
      var lastHeartbeat = SystemClock.elapsedRealtime()
      while (running) {
        if (audio.mode != AudioManager.MODE_NORMAL) { fail("Listening stopped for a call or audio interruption. Open Matrix to restart.", "AUDIO_MODE_BUSY"); break }
        val count = record.read(samples, 0, samples.size)
        if (!running) break
        check(count > 0) { "Microphone capture failed ($count). Open Matrix to restart." }
        val now = SystemClock.elapsedRealtime()
        HeyMatrixRuntime.diagnostics.captured(count, (0 until count).any { samples[it] != 0.toShort() }, System.currentTimeMillis())
        if (now - lastHeartbeat >= 30000) {
          HeyMatrixRuntime.log("capture_alive decoder_progress=${HeyMatrixRuntime.diagnostics.decodeSteps > 0}")
          lastHeartbeat = now
        }
        if (policy.coolingDown(now)) { wasCooling = true; continue }
        if (wasCooling) { kws.reset(stream); HeyMatrixRuntime.diagnostics.stage("listening"); publish("listening", "Listening on device for Hey Matrix"); wasCooling = false }
        stream.acceptWaveform(FloatArray(count) { samples[it] / 32768.0f }, 16000)
        while (running && kws.isReady(stream)) {
          kws.decode(stream)
          HeyMatrixRuntime.diagnostics.decoded()
          // Check the configured label; never emit result text/tokens to logs or React.
          if (kws.getResult(stream).keyword == WakeModel.EXPECTED_KEYWORD) {
            kws.reset(stream)
            if (policy.accept(SystemClock.elapsedRealtime())) {
              HeyMatrixRuntime.detected()
              if (VoiceCommandCycle.foregroundAllowed(this)) {
                handoff = true
                HeyMatrixRuntime.voiceStatus = "Releasing wake microphone before command capture"
                return // finally releases AudioRecord/model before speech starts.
              }
              HeyMatrixRuntime.voiceStatus = "Wake detected. Open and unlock Matrix for hands-free commands; background capture is deferred."
              HeyMatrixRuntime.diagnostics.stage("cooldown")
              publish("cooldown", "Heard Hey Matrix — cooldown")
              main.post { if (running) acknowledge() }
            }
            break
          }
        }
      }
    } catch (error: Throwable) {
      if (running) {
        val stage = HeyMatrixRuntime.diagnostics.stage
        val help = when (stage) {
          "checking_assets" -> "Wake model assets are missing or invalid. Reinstall this APK."
          "loading_model" -> "Wake model initialization failed. Check HeyMatrix logcat for the failure stage; reinstall the APK if needed."
          "starting_microphone" -> "Microphone could not start. Allow microphone access, close other recording apps, and retry."
          else -> "Audio capture or decoding failed. Stop listening, close other recording apps, and retry."
        }
        // Exception type only: no arbitrary native exception text or recognizer result.
        HeyMatrixRuntime.log("failure stage=$stage exception_type=${error.javaClass.simpleName}")
        fail(help, "FAILED_" + stage.uppercase())
      }
    } finally {
      if (Build.VERSION.SDK_INT >= 29) runCatching { localRecorder?.unregisterAudioRecordingCallback(recordingCallback) }
      val released = synchronized(captureLock) {
        val ok = WakeMicrophoneRelease.perform({ localRecorder?.stop() }, {
          try { localRecorder?.release() }
          catch (failure: Exception) {
            HeyMatrixRuntime.diagnostics.voiceFailure("wake_microphone_release", VoicePhase.PASSIVE_WAKE.name,
              "WAKE_MIC_RELEASE_FAILED", -1, failure.javaClass.simpleName,
              "Wake microphone could not be released. Force-stop and reopen Matrix.", false)
            HeyMatrixRuntime.log("wake_release_exception exception_type=${failure.javaClass.simpleName}")
            throw failure
          }
        })
        if (ok) recorder = null
        ok
      }
      if (released) {
        HeyMatrixRuntime.diagnostics.wakeReleased(System.currentTimeMillis())
        HeyMatrixRuntime.log("wake_microphone_release_complete")
      } else {
        handoff = false
        fail("Wake microphone release failed. Recognition was not started; force-stop and reopen Matrix.", "WAKE_MIC_RELEASE_FAILED")
      }
      runCatching { stream?.release() }; runCatching { kws?.release() }
      runCatching { wakeLock?.let { if (it.isHeld) it.release() } }; wakeLock = null
      HeyMatrixRuntime.diagnostics.microphone(false)
      HeyMatrixRuntime.diagnostics.model(false)
      HeyMatrixRuntime.log("microphone_model_released")
      cleanedUp = true
      main.post {
        cleanupDelivered = true
        if (destroyed) {
          HeyMatrixRuntime.occupied = recorder != null || VoiceCommandCycle.microphoneBlocked
          if (!terminalError) HeyMatrixRuntime.update("stopped", "Hey Matrix is off.")
        } else if (handoff && running && !terminalError) {
          worker = null
          if (running && !destroyed) VoiceCommandCycle(this, { recorder == null && worker == null && cleanedUp }, { acknowledge() }) { released ->
            if (released) startPassive() else fail("Recognition microphone cleanup failed. Restart Matrix before listening again.", "SR_CLEANUP_EXCEPTION")
          }.start()
        } else stopSelf()
      }
    }
  }
  private fun acknowledge(): Boolean {
    if (focusRequest != null) return false // Do not overlap diagnostic or wake acknowledgments.
    if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
      HeyMatrixRuntime.diagnostics.tone("Muted: raise Android media volume")
      HeyMatrixRuntime.log("tone_muted")
      return false
    }
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener).build()
    val granted = audio.requestAudioFocus(focusRequest!!) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    var played = false
    if (granted) {
      runCatching {
        tone = ToneGenerator(AudioManager.STREAM_MUSIC, 45)
        val started = tone?.startTone(ToneGenerator.TONE_PROP_ACK, 160) == true
        played = started
        HeyMatrixRuntime.diagnostics.tone(if (started) "Playback requested (not proof of audibility)" else "Tone playback rejected")
        HeyMatrixRuntime.log(if (started) "tone_requested" else "tone_rejected")
      }.onFailure {
        HeyMatrixRuntime.diagnostics.tone("Tone unavailable on this audio route")
        HeyMatrixRuntime.log("tone_failed")
      }
    }
    if (!granted) {
      HeyMatrixRuntime.diagnostics.tone("Audio focus denied: stop calls or competing audio and retry")
      HeyMatrixRuntime.log("tone_focus_denied")
    }
    main.postDelayed({ tone?.release(); tone = null; focusRequest?.let { audio.abandonAudioFocusRequest(it) }; focusRequest = null }, 250)
    return played
  }
  private fun fail(detail: String, code: String = "INTERRUPTED") {
    main.post {
      if (!destroyed && ((!terminalError && running) || HeyMatrixRuntime.state == "starting")) {
        terminalError = true; HeyMatrixRuntime.diagnostics.error(code); HeyMatrixRuntime.log("service_error code=$code"); HeyMatrixRuntime.update("error", detail); stopSelf()
      }
    }
  }
  override fun onDestroy() {
    destroyed = true
    VoiceCommandCycle.active?.dispose()
    if (activeInstance === this) activeInstance = null
    HeyMatrixRuntime.diagnostics.stopped()
    HeyMatrixRuntime.log("service_destroyed")
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
      HeyMatrixRuntime.occupied = recorder != null || VoiceCommandCycle.microphoneBlocked
      if (!terminalError) HeyMatrixRuntime.update("stopped", "Hey Matrix is off.")
    } else if (!terminalError) HeyMatrixRuntime.update("stopping", "Releasing microphone…")
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
