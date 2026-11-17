package expo.modules.heymatrix

// Pure policy, also used by the service's real detection path.
class WakePolicy(private val cooldownMs: Long = 2500) {
  private var nextAllowed = 0L
  fun accept(now: Long): Boolean {
    if (now < nextAllowed) return false
    nextAllowed = now + cooldownMs
    return true
  }
  fun coolingDown(now: Long) = now < nextAllowed
}
