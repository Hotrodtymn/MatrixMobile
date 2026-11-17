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
  @Synchronized fun begin() {
    stage = "start_requested"; serviceStarted = false; modelLoaded = false
    microphoneActive = false; samplesRead = 0; decodeSteps = 0; inputObserved = false
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
    "toneStatus" to toneStatus, "lastErrorCode" to lastErrorCode)
}
