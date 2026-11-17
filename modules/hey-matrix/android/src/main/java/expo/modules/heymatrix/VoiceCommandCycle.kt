package expo.modules.heymatrix

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.*
import android.speech.*
import android.speech.tts.*
import java.util.UUID

// Main-thread only; wake AudioRecord is fully released before this object starts.
class VoiceCommandCycle(private val context: Context, private val wakeReleased: () -> Boolean, private val acknowledge: () -> Boolean, private val resumeWake: (Boolean) -> Unit) {
  companion object {
    @Volatile var hostReady = false
    @Volatile var heartbeat = 0L
    var active: VoiceCommandCycle? = null
    @Volatile var microphoneBlocked = false
    fun foregroundAllowed(context: Context) = !microphoneBlocked && hostReady && SystemClock.elapsedRealtime() - heartbeat < 2000 &&
      !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
  }
  private val handler = Handler(Looper.getMainLooper())
  private val flow = VoiceFlow()
  private var stage = "preflight"
  private fun stage(value: String) {
    stage = value; HeyMatrixRuntime.diagnostics.voiceStage(value)
    HeyMatrixRuntime.log("voice_stage=$value main_thread=${Looper.myLooper() == Looper.getMainLooper()}")
  }
  private fun requireMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "Voice operation requires main thread" } }
  private val id = UUID.randomUUID().toString()
  private var live = true
  private var cleanupFailed = false
  private var recognizer: SpeechRecognizer? = null
  private var tts: TextToSpeech? = null
  private var deadline: Runnable? = null
  private var pending: Map<String, Any>? = null
  private var title = ""
  private var date = ""
  private var saveResponseHandled = false
  private var currentUtterance = ""
  private var focus: AudioFocusRequest? = null
  private val audio = context.getSystemService(AudioManager::class.java)
  private fun phase(next: VoicePhase, status: String) {
    flow.move(next); HeyMatrixRuntime.voicePhase = next.name; HeyMatrixRuntime.voiceStatus = status
    HeyMatrixRuntime.log("voice_phase=" + next.name)
  }
  private fun valid() = live && active === this && foregroundAllowed(context)
  private fun timeout(ms: Long, block: () -> Unit) {
    deadline?.let { handler.removeCallbacks(it) }
    deadline = Runnable { if (live) block() }.also { handler.postDelayed(it, ms) }
  }
  fun start() {
    requireMain()
    active = this
    phase(VoicePhase.COMMAND_CAPTURE, "Preparing offline speech recognition")
    stage("preflight")
    if (!wakeReleased()) { error("Wake microphone release is not complete. Recognition was not started.", "WAKE_MIC_NOT_RELEASED"); return }
    if (!valid()) { error("Commands require Matrix visible and unlocked. Passive wake remains available."); return }
    if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
      error("On-device recognition unavailable. Install an English offline speech model; no online fallback is used.", "SR_ON_DEVICE_UNAVAILABLE"); return
    }
    if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) { error("Raise media volume for spoken readback before creating reminders.", "TTS_MEDIA_MUTED"); return }
    stage("tts_initializing")
    timeout(10000) { error("Offline text-to-speech initialization timed out.", "TTS_INIT_TIMEOUT") }
    try {
    tts = TextToSpeech(context) { status -> handler.post {
      try {
      if (!live || flow.phase != VoicePhase.COMMAND_CAPTURE) return@post
      if (status != TextToSpeech.SUCCESS) { error("Text-to-speech unavailable. Install an offline English voice.", "TTS_INIT_FAILED"); return@post }
      val voice = tts?.voices?.firstOrNull { it.locale.language == "en" && !it.isNetworkConnectionRequired }
      if (voice == null || tts?.setVoice(voice) != TextToSpeech.SUCCESS) { error("An offline English text-to-speech voice is required.", "TTS_LOCAL_VOICE_MISSING"); return@post }
      stage("tts_ready")
      capture(false) // Cue is issued only from onReadyForSpeech, not before service binding.
      } catch (failure: Exception) { error("Offline speech setup failed. Check installed English voices and audio settings.", "TTS_SETUP_EXCEPTION", exception = failure) }
    } }
    } catch (failure: Exception) { error("Could not initialize offline text-to-speech.", "TTS_INIT_EXCEPTION", exception = failure) }
  }
  private fun clearRecognizer(): Boolean {
    requireMain()
    val previous = recognizer; recognizer = null
    runCatching { previous?.cancel() }.onFailure {
      HeyMatrixRuntime.log("recognizer_cancel_exception exception_type=${it.javaClass.simpleName}")
    }
    val released = runCatching { previous?.destroy() }
    if (released.isFailure) {
      cleanupFailed = true
      microphoneBlocked = true
      val type = released.exceptionOrNull()?.javaClass?.simpleName ?: "UnknownException"
      HeyMatrixRuntime.diagnostics.voiceCleanup(type)
      HeyMatrixRuntime.log("recognizer_destroy_exception exception_type=$type")
    }
    if (!cleanupFailed) HeyMatrixRuntime.diagnostics.microphone(false)
    return !cleanupFailed
  }
  private fun capture(confirmation: Boolean) {
    requireMain()
    if (!valid()) { cancel(); return }
    if (flow.phase != (if (confirmation) VoicePhase.CONFIRMATION else VoicePhase.COMMAND_CAPTURE)) return
    if (!clearRecognizer()) { error("Recognizer cleanup failed. Listening will stop; restart Matrix.", "SR_CLEANUP_EXCEPTION"); return }
    HeyMatrixRuntime.voiceStatus = if (confirmation) "Listening for yes or no" else "Listening for reminder command"
    try {
      check(wakeReleased()) { "Wake microphone still owned" }
      check(androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) { "Microphone permission removed" }
      stage(if (confirmation) "confirmation_recognizer_create" else "command_recognizer_create")
      val turn = RecognitionTurn()
      val current = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      recognizer = current
      current.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
          requireMain()
          if (!live || recognizer !== current) return
          if (!valid()) { cancel(); return }
          if (!turn.markReady()) return
          stage(if (confirmation) "confirmation_recognizer_ready" else "command_recognizer_ready")
          HeyMatrixRuntime.diagnostics.microphone(true)
          if (!confirmation && !acknowledge()) { error("Ready tone failed. Check media volume and audio focus.", "READY_CUE_FAILED"); return }
          timeout(if (confirmation) 8000 else 12000) { error("Speech timed out. No reminder saved.", "VOICE_CAPTURE_TIMEOUT") }
        }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {} // Never retain/log audio levels.
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
        override fun onError(code: Int) {
          requireMain()
          if (live && recognizer === current) {
            val mapped = VoiceFailure.recognition(code)
            error(mapped.second, "SR_" + mapped.first, code)
          }
        }
        override fun onResults(results: Bundle?) {
          requireMain()
          if (!live || recognizer !== current) return
          if (!valid()) { cancel(); return }
          if (!turn.ready) { error("Recognition returned a result before its ready callback. No reminder saved.", "SR_RESULT_BEFORE_READY"); return }
          stage(if (confirmation) "confirmation_result" else "command_result")
          val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
          if (!clearRecognizer()) { error("Recognizer cleanup failed. Nothing saved.", "SR_CLEANUP_EXCEPTION"); return }
          if (text.isEmpty()) { error("No speech recognized. No reminder saved.", "SR_EMPTY_RESULT"); return }
          if (confirmation) {
            if (!flow.confirm(text)) { finish("Cancelled. No reminder saved."); return }
            phase(VoicePhase.SAVING, "Saving explicitly confirmed reminder")
            pending = mapOf("id" to id, "kind" to "save", "title" to title, "date" to date)
            timeout(15000) { error("Save did not finish in time. Check reminders before trying again.", "BRIDGE_SAVE_TIMEOUT") }
          } else {
            if (text.lowercase().trimEnd('.', '!', '?') in listOf("cancel", "stop", "no")) { finish("Cancelled. No reminder saved."); return }
            stage("awaiting_parser")
            pending = mapOf("id" to id, "kind" to "parse", "text" to text.take(500))
            timeout(5000) { error("Reminder parser unavailable. No reminder saved.", "BRIDGE_PARSE_TIMEOUT") }
          }
        }
      })
      stage(if (confirmation) "confirmation_recognizer_start" else "command_recognizer_start")
      timeout(5000) { error("Recognition service did not become ready. Check offline speech settings.", "SR_READY_TIMEOUT") }
      current.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      })
    } catch (failure: Exception) { error("Could not start on-device recognition. No reminder saved.", "SR_START_EXCEPTION", exception = failure) }
  }
  fun takeRequest(): Map<String, Any>? {
    if (!valid()) { cancel(); return null }
    val result = pending; pending = null; return result
  }
  fun parsed(requestId: String, parsedTitle: String, parsedDate: String, readback: String) {
    if (!valid() || requestId != id || flow.phase != VoicePhase.COMMAND_CAPTURE) return
    if (parsedTitle.isBlank() || parsedTitle.length > 150 || readback.length > 1000) { reject(requestId); return }
    title = parsedTitle; date = parsedDate
    phase(VoicePhase.CONFIRMATION, "Speaking reminder readback; confirmation follows")
    speak(readback) { capture(true) }
  }
  private fun speak(text: String, done: () -> Unit) {
    requireMain()
    stage(if (flow.phase == VoicePhase.SAVING) "tts_saved_feedback" else "tts_readback")
    if (!clearRecognizer()) { error("Recognizer cleanup failed before readback.", "SR_CLEANUP_EXCEPTION"); return }
    if (!valid()) { cancel(); return }
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener { change -> if (change < 0 && live) cancel() }.build()
    if (audio.requestAudioFocus(focus!!) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { error("Audio focus unavailable for spoken confirmation.", "TTS_FOCUS_DENIED"); return }
    val utterance = UUID.randomUUID().toString()
    currentUtterance = utterance
    tts?.setAudioAttributes(attributes)
    tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}
      override fun onDone(utteranceId: String?) { handler.post {
        if (utteranceId != utterance || currentUtterance != utterance || !valid()) return@post
        focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
        currentUtterance = ""
        handler.postDelayed({ if (valid()) done() else cancel() }, 250)
      } }
      @Deprecated("Android legacy callback") override fun onError(utteranceId: String?) { handler.post { if (live && utteranceId == currentUtterance) error("Spoken readback failed. No unconfirmed reminder was saved.", "TTS_UTTERANCE_ERROR") } }
      override fun onError(utteranceId: String?, errorCode: Int) { handler.post { if (live && utteranceId == currentUtterance) error("Text-to-speech failed; report the TTS status code.", "TTS_UTTERANCE_ERROR", errorCode) } }
    })
    timeout(30000) { error("Spoken readback timed out. No unconfirmed reminder was saved.", "TTS_READBACK_TIMEOUT") }
    if (tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utterance) != TextToSpeech.SUCCESS) error("Could not speak reminder readback.", "TTS_SPEAK_REJECTED")
  }
  fun reject(requestId: String, reason: String = "AMBIGUOUS_REMINDER") {
    if (requestId != id || !live || flow.phase != VoicePhase.COMMAND_CAPTURE) return
    stage("parser_rejected")
    if (reason == "UNSUPPORTED_ALARM") error("Alarm voice commands are not implemented. Say Remind me to call Mom tomorrow at 3 PM. Nothing was saved.", "COMMAND_UNSUPPORTED_ALARM")
    else error("Reminder command is ambiguous. Use Remind me to call Mom tomorrow at 3 PM. Nothing saved.", "COMMAND_AMBIGUOUS_REMINDER")
  }
  fun authorized(requestId: String) = valid() && requestId == id && flow.phase == VoicePhase.SAVING && flow.confirmed
  fun saved(requestId: String, ok: Boolean) {
    if (!authorized(requestId) || saveResponseHandled) return
    saveResponseHandled = true
    if (ok) { speak("Reminder saved.") { finish("Reminder saved. Passive wake restored.") } }
    else error("Could not save reminder. Check notifications and reminder settings before retrying.", "REMINDER_SAVE_FAILED")
  }
  fun checkHost() { if (live && !foregroundAllowed(context)) cancel() }
  private fun error(message: String, code: String = "VOICE_STAGE_FAILED", androidCode: Int = -1, exception: Throwable? = null) {
    requireMain()
    if (!live || flow.phase == VoicePhase.ERROR) return
    val failedPhase = flow.phase.name
    val exceptionType = exception?.javaClass?.simpleName ?: ""
    HeyMatrixRuntime.diagnostics.voiceFailure(stage, failedPhase, code, androidCode, exceptionType, message, Looper.myLooper() == Looper.getMainLooper())
    HeyMatrixRuntime.log("voice_failure stage=$stage phase=$failedPhase code=$code android_code=$androidCode exception_type=$exceptionType main_thread=true")
    currentUtterance = ""; tts?.stop()
    focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    clearRecognizer(); pending = null
    if (flow.phase != VoicePhase.ERROR) phase(VoicePhase.ERROR, message)
    // Fixed status only, never command text. Native notification/Settings retains it.
    HeyMatrixRuntime.diagnostics.error(code)
    timeout(700) { finish(message) }
  }
  fun cancel() { if (live) finish("Voice session cancelled. Keep Matrix visible and unlocked for commands.") }
  private fun finish(status: String) {
    if (!live) return
    if (flow.phase != VoicePhase.RETURN_TO_WAKE) phase(VoicePhase.RETURN_TO_WAKE, status)
    dispose()
    handler.postDelayed({ resumeWake(!cleanupFailed) }, 500)
  }
  fun dispose() {
    live = false; pending = null; title = ""; date = ""; currentUtterance = ""
    deadline?.let { handler.removeCallbacks(it) }; deadline = null
    clearRecognizer(); tts?.stop(); tts?.shutdown(); tts = null
    focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    if (active === this) active = null
  }
}
