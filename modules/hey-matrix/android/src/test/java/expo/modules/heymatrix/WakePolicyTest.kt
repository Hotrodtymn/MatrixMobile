package expo.modules.heymatrix
import org.junit.Assert.*
import org.junit.Test
class WakePolicyTest {
  @Test fun acceptsFirstWakeAndSuppressesRepeatedDetectionsUntilBoundary() {
    val policy = WakePolicy(2500)
    assertTrue(policy.accept(100))
    assertFalse(policy.accept(100))
    assertTrue(policy.coolingDown(2599))
    assertFalse(policy.accept(2599))
    assertFalse(policy.coolingDown(2600))
    assertTrue(policy.accept(2600))
  }
}
