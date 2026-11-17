package expo.modules.heymatrix
import org.junit.Assert.*
import org.junit.Test
class VoiceFlowTest {
  @Test fun savingRequiresAnExactYesAfterReadback() {
    val flow = VoiceFlow()
    assertThrows(IllegalStateException::class.java) { flow.move(VoicePhase.SAVING) }
    flow.move(VoicePhase.COMMAND_CAPTURE); flow.move(VoicePhase.CONFIRMATION)
    for (text in listOf("no", "", "yes please", "maybe", "yesterday")) assertFalse(flow.confirm(text))
    assertThrows(IllegalStateException::class.java) { flow.move(VoicePhase.SAVING) }
    assertTrue(flow.confirm("Yes.")); flow.move(VoicePhase.SAVING)
    flow.move(VoicePhase.RETURN_TO_WAKE); flow.move(VoicePhase.PASSIVE_WAKE)
    assertFalse(flow.confirmed)
  }
  @Test fun errorsAndCancellationRecoverWithoutSaving() {
    val flow = VoiceFlow(); flow.move(VoicePhase.COMMAND_CAPTURE); flow.move(VoicePhase.ERROR)
    flow.move(VoicePhase.RETURN_TO_WAKE); flow.move(VoicePhase.PASSIVE_WAKE)
    flow.move(VoicePhase.COMMAND_CAPTURE); flow.move(VoicePhase.CONFIRMATION)
    assertFalse(flow.confirm("no")); flow.move(VoicePhase.RETURN_TO_WAKE)
  }
}
