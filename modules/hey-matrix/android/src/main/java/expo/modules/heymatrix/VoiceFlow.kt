package expo.modules.heymatrix

enum class VoicePhase { PASSIVE_WAKE, COMMAND_CAPTURE, CONFIRMATION, SAVING, RETURN_TO_WAKE, ERROR }
// No audio/transcripts; transitions and exact confirmation vocabulary are testable.
class VoiceFlow {
  var phase = VoicePhase.PASSIVE_WAKE; private set
  var confirmed = false; private set
  fun move(next: VoicePhase) {
    val allowed = when (phase) {
      VoicePhase.PASSIVE_WAKE -> setOf(VoicePhase.COMMAND_CAPTURE, VoicePhase.ERROR)
      VoicePhase.COMMAND_CAPTURE -> setOf(VoicePhase.CONFIRMATION, VoicePhase.ERROR, VoicePhase.RETURN_TO_WAKE)
      VoicePhase.CONFIRMATION -> setOf(VoicePhase.SAVING, VoicePhase.ERROR, VoicePhase.RETURN_TO_WAKE)
      VoicePhase.SAVING -> setOf(VoicePhase.RETURN_TO_WAKE, VoicePhase.ERROR)
      VoicePhase.RETURN_TO_WAKE -> setOf(VoicePhase.PASSIVE_WAKE)
      VoicePhase.ERROR -> setOf(VoicePhase.RETURN_TO_WAKE)
    }
    check(next in allowed) { "Invalid voice phase transition" }
    check(next != VoicePhase.SAVING || confirmed) { "Spoken yes required" }
    if (next == VoicePhase.COMMAND_CAPTURE || next == VoicePhase.PASSIVE_WAKE) confirmed = false
    phase = next
  }
  fun confirm(text: String): Boolean {
    check(phase == VoicePhase.CONFIRMATION)
    confirmed = text.trim().lowercase().trimEnd('.', '!', '?') == "yes"
    return confirmed
  }
}
