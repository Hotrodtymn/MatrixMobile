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
class VoiceCommandCycle(private val context: Context, private val acknowledge: () -> Boolean, private val resumeWake: () -> Unit) {
  companion object {
    @Volatile var hostReady = false
    @Volatile var heartbeat = 0L
    var active: VoiceCommandCycle? = null
    fun foregroundAllowed(context: Context) = hostReady && SystemClock.elapsedRealtime() - heartbeat < 2000 &&
      !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
  }
  private val handler = Handler(Looper.getMainLooper())
  private val flow = VoiceFlow()
  private val id = UUID.randomUUID().toString()
  private var live = true
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
    active = this
    phase(VoicePhase.COMMAND_CAPTURE, "Preparing offline speech recognition")
    if (!valid()) { error("Commands require Matrix visible and unlocked. Passive wake remains available."); return }
    if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
      error("On-device recognition unavailable. Install an English offline speech model; no online fallback is used."); return
    }
    if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) { error("Raise media volume for spoken readback before creating reminders."); return }
    timeout(10000) { error("Offline text-to-speech initialization timed out.") }
    try {
    tts = TextToSpeech(context) { status -> handler.post {
      try {
      if (!live || flow.phase != VoicePhase.COMMAND_CAPTURE) return@post
      if (status != TextToSpeech.SUCCESS) { error("Text-to-speech unavailable. Install an offline English voice."); return@post }
      val voice = tts?.voices?.firstOrNull { it.locale.language == "en" && !it.isNetworkConnectionRequired }
      if (voice == null || tts?.setVoice(voice) != TextToSpeech.SUCCESS) { error("An offline English text-to-speech voice is required."); return@post }
      if (!acknowledge()) { error("Acknowledgment unavailable. Check media volume and audio focus."); return@post }
      handler.postDelayed({ if (valid()) capture(false) else cancel() }, 300)
      } catch (_: Exception) { error("Offline speech setup failed. Check installed English voices and audio settings.") }
    } }
    } catch (_: Exception) { error("Could not initialize offline text-to-speech.") }
  }
  private fun clearRecognizer() {
    val previous = recognizer; recognizer = null
    runCatching { previous?.cancel() }; runCatching { previous?.destroy() }
    HeyMatrixRuntime.diagnostics.microphone(false)
  }
  private fun capture(confirmation: Boolean) {
    if (!valid()) { cancel(); return }
    if (flow.phase != (if (confirmation) VoicePhase.CONFIRMATION else VoicePhase.COMMAND_CAPTURE)) return
    clearRecognizer()
    HeyMatrixRuntime.voiceStatus = if (confirmation) "Listening for yes or no" else "Listening for reminder command"
    try {
      val current = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      recognizer = current
      current.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { if (live && recognizer === current) HeyMatrixRuntime.diagnostics.microphone(true) }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {} // Never retain/log audio levels.
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
        override fun onError(code: Int) {
          if (live && recognizer === current) error("Speech recognition failed (code $code). Check the offline language model and microphone, then try again.")
        }
        override fun onResults(results: Bundle?) {
          if (!live || recognizer !== current) return
          if (!valid()) { cancel(); return }
          val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
          clearRecognizer()
          if (text.isEmpty()) { error("No speech recognized. No reminder saved."); return }
          if (confirmation) {
            if (!flow.confirm(text)) { finish("Cancelled. No reminder saved."); return }
            phase(VoicePhase.SAVING, "Saving explicitly confirmed reminder")
            pending = mapOf("id" to id, "kind" to "save", "title" to title, "date" to date)
            timeout(15000) { error("Save did not finish in time. Check reminders before trying again.") }
          } else {
            if (text.lowercase().trimEnd('.', '!', '?') in listOf("cancel", "stop", "no")) { finish("Cancelled. No reminder saved."); return }
            pending = mapOf("id" to id, "kind" to "parse", "text" to text.take(500))
            timeout(5000) { error("Reminder parser unavailable. No reminder saved.") }
          }
        }
      })
      current.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      })
      timeout(if (confirmation) 8000 else 12000) { error("Speech timed out. No reminder saved.") }
    } catch (_: Exception) { error("Could not start on-device recognition. No reminder saved.") }
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
    clearRecognizer()
    if (!valid()) { cancel(); return }
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener { change -> if (change < 0 && live) cancel() }.build()
    if (audio.requestAudioFocus(focus!!) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { error("Audio focus unavailable for spoken confirmation."); return }
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
      @Deprecated("Android legacy callback") override fun onError(utteranceId: String?) { handler.post { if (live && utteranceId == currentUtterance) error("Spoken readback failed. No unconfirmed reminder was saved.") } }
    })
    timeout(30000) { error("Spoken readback timed out. No unconfirmed reminder was saved.") }
    if (tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utterance) != TextToSpeech.SUCCESS) error("Could not speak reminder readback.")
  }
  fun reject(requestId: String) { if (requestId == id && live) error("Command is ambiguous or unsupported. Say remind me to call Mom tomorrow at 3 PM. Nothing saved.") }
  fun authorized(requestId: String) = valid() && requestId == id && flow.phase == VoicePhase.SAVING && flow.confirmed
  fun saved(requestId: String, ok: Boolean) {
    if (!authorized(requestId) || saveResponseHandled) return
    saveResponseHandled = true
    if (ok) { speak("Reminder saved.") { finish("Reminder saved. Passive wake restored.") } }
    else error("Could not save reminder. Check notifications and reminder settings before retrying.")
  }
  fun checkHost() { if (live && !foregroundAllowed(context)) cancel() }
  private fun error(message: String) {
    if (!live) return
    currentUtterance = ""; tts?.stop()
    focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    clearRecognizer(); pending = null
    if (flow.phase != VoicePhase.ERROR) phase(VoicePhase.ERROR, message)
    // Fixed status only, never command text. Native notification/Settings retains it.
    HeyMatrixRuntime.diagnostics.error("VOICE_SESSION_ERROR")
    timeout(700) { finish(message) }
  }
  fun cancel() { if (live) finish("Voice session cancelled. Keep Matrix visible and unlocked for commands.") }
  private fun finish(status: String) {
    if (!live) return
    if (flow.phase != VoicePhase.RETURN_TO_WAKE) phase(VoicePhase.RETURN_TO_WAKE, status)
    dispose()
    handler.postDelayed({ resumeWake() }, 500)
  }
  fun dispose() {
    live = false; pending = null; title = ""; date = ""; currentUtterance = ""
    deadline?.let { handler.removeCallbacks(it) }; deadline = null
    clearRecognizer(); tts?.stop(); tts?.shutdown(); tts = null
    focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    if (active === this) active = null
  }
}
