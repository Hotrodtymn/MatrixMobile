package expo.modules.heymatrix

// Process-memory only. No PCM, transcript, recognized tokens or amplitude history.
class WakeDiagnostics {
  var stage = "off"; private set
  var serviceStarted = false; private set
  var modelLoaded = false; private set
  var microphoneActive = false; private set
  var samplesRead = 0L; private set
  var decodeSteps = 0L; private set
  var inputObserved = false; private set
  var lastAudioAt = 0L; private set
  var lastDetectionAt = 0L; private set
  var toneStatus = "Not requested"; private set
  var lastErrorCode = ""; private set
  private var voiceCleanupException = ""
  @Synchronized fun voiceCleanup(type: String) { voiceCleanupException = type }
  private var voiceStage = "idle"
  private var voiceFailure: Map<String, Any> = emptyMap()
  private var wakeReleasedAt = 0L
  @Synchronized fun voiceStage(value: String) { voiceStage = value }
  @Synchronized fun wakeReleased(now: Long) { wakeReleasedAt = now }
  @Synchronized fun voiceFailure(stage: String, phase: String, code: String, androidCode: Int,
    exceptionType: String, explanation: String, mainThread: Boolean) {
    voiceFailure = mapOf("stage" to stage, "phase" to phase, "code" to code,
      "androidCode" to androidCode, "exceptionType" to exceptionType,
      "explanation" to explanation, "at" to System.currentTimeMillis(),
      "mainThread" to mainThread, "wakeReleasedAt" to wakeReleasedAt)
  }
  @Synchronized fun begin() {
    stage = "start_requested"; serviceStarted = false; modelLoaded = false
    microphoneActive = false; samplesRead = 0; decodeSteps = 0; inputObserved = false
    voiceStage = "idle"; voiceCleanupException = ""; voiceFailure = emptyMap(); wakeReleasedAt = 0
    lastAudioAt = 0; lastDetectionAt = 0; toneStatus = "Not requested"; lastErrorCode = ""
  }
  @Synchronized fun stage(value: String) { stage = value }
  @Synchronized fun service(value: Boolean) { serviceStarted = value }
  @Synchronized fun model(value: Boolean) { modelLoaded = value }
  @Synchronized fun microphone(value: Boolean) { microphoneActive = value }
  @Synchronized fun captured(count: Int, nonzero: Boolean, now: Long) {
    samplesRead += count; inputObserved = inputObserved || nonzero; lastAudioAt = now
  }
  @Synchronized fun decoded() { decodeSteps++ }
  @Synchronized fun detected(now: Long) { lastDetectionAt = now }
  @Synchronized fun tone(value: String) { toneStatus = value }
  @Synchronized fun error(code: String) { lastErrorCode = code; stage = "error" }
  @Synchronized fun stopped() { serviceStarted = false; microphoneActive = false; stage = if (lastErrorCode.isEmpty()) "stopped" else "error" }
  @Synchronized fun snapshot(): Map<String, Any> = mapOf(
    "stage" to stage, "serviceStarted" to serviceStarted, "modelLoaded" to modelLoaded,
    "microphoneActive" to microphoneActive, "samplesRead" to samplesRead, "decodeSteps" to decodeSteps,
    "inputObserved" to inputObserved, "lastAudioAt" to lastAudioAt, "lastDetectionAt" to lastDetectionAt,
    "toneStatus" to toneStatus, "lastErrorCode" to lastErrorCode,
    "voiceStage" to voiceStage, "voiceCleanupException" to voiceCleanupException, "voiceFailure" to voiceFailure, "wakeReleasedAt" to wakeReleasedAt)
}
