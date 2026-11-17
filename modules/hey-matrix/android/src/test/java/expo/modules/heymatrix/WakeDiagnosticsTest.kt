package expo.modules.heymatrix
import org.junit.Assert.*
import org.junit.Test
class WakeDiagnosticsTest {
  @Test fun reportsRealStagesAndRetainsFailureEvidenceAfterCleanup() {
    val d = WakeDiagnostics()
    d.begin(); d.service(true); d.model(true); d.microphone(true)
    d.captured(1600, false, 10); d.captured(1600, true, 20); d.decoded(); d.detected(30)
    d.tone("Muted: raise Android media volume"); d.error("MIC_SILENCED"); d.stopped(); d.model(false)
    val s = d.snapshot()
    assertEquals(false, s["serviceStarted"]); assertEquals(false, s["microphoneActive"])
    assertEquals(false, s["modelLoaded"]); assertEquals(3200L, s["samplesRead"])
    assertEquals(1L, s["decodeSteps"]); assertEquals(true, s["inputObserved"])
    assertEquals(30L, s["lastDetectionAt"]); assertEquals("MIC_SILENCED", s["lastErrorCode"])
    assertFalse(s.keys.any { it in listOf("audio", "pcm", "transcript", "tokens", "recognizedText") })
    d.begin()
    assertEquals(0L, d.snapshot()["samplesRead"]); assertEquals(0L, d.snapshot()["lastDetectionAt"])
    assertEquals("", d.snapshot()["lastErrorCode"])
  }
}
