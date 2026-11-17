package expo.modules.heymatrix

// Android SpeechRecognizer public error numbers; pure mapping is JVM-testable.
object VoiceFailure {
  fun recognition(code: Int): Pair<String, String> = when (code) {
    1 -> "ERROR_NETWORK_TIMEOUT" to "Recognition service timed out. Verify the installed on-device service; Matrix will not switch online."
    2 -> "ERROR_NETWORK" to "The selected recognition service reported a network error despite on-device mode. Check the installed offline service."
    3 -> "ERROR_AUDIO" to "Android could not record audio. Check microphone privacy, permission and competing recording apps."
    4 -> "ERROR_SERVER" to "The recognition service failed. Restart its offline service and retry."
    5 -> "ERROR_CLIENT" to "Recognition client failed. Retest the microphone handoff and service lifecycle."
    6 -> "ERROR_SPEECH_TIMEOUT" to "Android heard no speech. Wait for the ready tone, then speak a reminder."
    7 -> "ERROR_NO_MATCH" to "Android produced no matching speech. Speak a clear reminder after the ready tone."
    8 -> "ERROR_RECOGNIZER_BUSY" to "The recognition service is busy. Stop other recording or assistant sessions and retry."
    9 -> "ERROR_INSUFFICIENT_PERMISSIONS" to "Allow Matrix microphone access and enable the Android microphone privacy switch."
    10 -> "ERROR_TOO_MANY_REQUESTS" to "Android throttled recognition requests. Wait before trying again."
    11 -> "ERROR_SERVER_DISCONNECTED" to "The on-device recognition service disconnected. Restart it and retry."
    12 -> "ERROR_LANGUAGE_NOT_SUPPORTED" to "The on-device recognizer does not support en-US. Select/install a compatible English recognition service."
    13 -> "ERROR_LANGUAGE_UNAVAILABLE" to "Download the offline en-US recognition model in Android speech settings, then retry."
    14 -> "ERROR_CANNOT_CHECK_SUPPORT" to "The service could not check recognition support."
    15 -> "ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS" to "The service could not monitor language model downloads."
    else -> "ERROR_UNKNOWN" to "Android returned an unknown recognition error; report its numeric code."
  }
}

object WakeMicrophoneRelease {
  // A failed stop does not prevent release. A failed release MUST block handoff.
  fun perform(stop: () -> Unit, release: () -> Unit): Boolean {
    runCatching(stop)
    return runCatching(release).isSuccess
  }
}

class RecognitionTurn {
  var ready = false; private set
  fun markReady(): Boolean { if (ready) return false; ready = true; return true }
}
