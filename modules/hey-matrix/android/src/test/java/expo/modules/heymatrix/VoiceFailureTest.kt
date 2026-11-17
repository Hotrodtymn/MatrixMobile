package expo.modules.heymatrix
import org.junit.Assert.*
import org.junit.Test
class VoiceFailureTest {
  @Test fun androidErrorsRetainPreciseNamesAndOfflineRecovery() {
    assertEquals("ERROR_AUDIO", VoiceFailure.recognition(3).first)
    assertEquals("ERROR_NO_MATCH", VoiceFailure.recognition(7).first)
    assertEquals("ERROR_RECOGNIZER_BUSY", VoiceFailure.recognition(8).first)
    assertEquals("ERROR_INSUFFICIENT_PERMISSIONS", VoiceFailure.recognition(9).first)
    assertEquals("ERROR_LANGUAGE_NOT_SUPPORTED", VoiceFailure.recognition(12).first)
    assertEquals("ERROR_LANGUAGE_UNAVAILABLE", VoiceFailure.recognition(13).first)
    assertTrue(VoiceFailure.recognition(13).second.contains("offline en-US"))
    assertEquals("ERROR_UNKNOWN", VoiceFailure.recognition(999).first)
  }
  @Test fun releaseMustCompleteBeforeHandoffAndCueWaitsForReadiness() {
    var released = false
    assertTrue(WakeMicrophoneRelease.perform({ throw IllegalStateException("already stopped") }, { released = true }))
    assertTrue(released)
    assertFalse(WakeMicrophoneRelease.perform({}, { throw IllegalStateException("release failed") }))
    val turn = RecognitionTurn()
    assertFalse(turn.ready); assertTrue(turn.markReady()); assertTrue(turn.ready)
    assertFalse(turn.markReady()) // duplicate callbacks cannot replay the cue
  }
  @Test fun historicalFailureSurvivesPassiveWakeRecoveryWithoutTranscriptData() {
    val d = WakeDiagnostics(); d.wakeReleased(100)
    d.voiceFailure("command_recognizer_start", "COMMAND_CAPTURE", "SR_ERROR_LANGUAGE_UNAVAILABLE", 13, "", "Install offline model", true)
    d.error("SR_ERROR_LANGUAGE_UNAVAILABLE"); d.stage("listening")
    val failure = d.snapshot()["voiceFailure"] as Map<*, *>
    assertEquals(13, failure["androidCode"]); assertEquals("command_recognizer_start", failure["stage"])
    assertEquals("COMMAND_CAPTURE", failure["phase"]); assertEquals(100L, failure["wakeReleasedAt"])
    assertEquals(true, failure["mainThread"])
    assertFalse(failure.keys.any { it in listOf("audio", "transcript", "tokens", "command") })
  }
}
