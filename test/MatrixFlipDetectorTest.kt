package expo.modules.alarm

fun main() {
  fun trace(detector: MatrixFlipDetector, start: Long, end: Long, z: Float, x: Float = 0f): Boolean {
    var detected = false
    for (time in start..end step 100L) detected = detector.update(x, 0f, z, time) || detected
    return detected
  }
  fun armed(): MatrixFlipDetector = MatrixFlipDetector().also {
    check(!trace(it, 0, 1000, 9.8f))
    check(it.state == "armed")
  }

  check(!trace(MatrixFlipDetector(), 0, 3000, -9.8f)) // initially face down never arms
  val clean = armed()
  check(!trace(clean, 1100, 1600, -9.8f)) // filter settling + short hold
  check(trace(clean, 1700, 3000, -9.8f))
  clean.reset()
  check(!trace(clean, 4000, 6000, -9.8f)) // reset clears arming

  val vibration = armed()
  var vibrationDetected = false
  for (time in 1100L..5000L step 100L) {
    // Synthetic recurring vibration; old raw magnitude gate resets the hold on
    // every 13 m/s² pulse and fails this trace. These are not device measurements.
    val z = if (time % 600L == 0L) -13f else -9.8f
    vibrationDetected = vibration.update(0f, 0f, z, time) || vibrationDetected
  }
  check(vibrationDetected) { "Face-down hold must survive periodic vibration" }

  val minorTilt = armed()
  check(!trace(minorTilt, 1100, 4000, -5f, 8.4f))
  val briefFlip = armed()
  check(!trace(briefFlip, 1100, 1500, -9.8f))
  check(!trace(briefFlip, 1600, 3000, 9.8f))

  val shock = armed()
  check(!trace(shock, 1100, 1600, -9.8f))
  check(!shock.update(0f, 0f, -30f, 1700)) // strong shock restarts hold
  check(!trace(shock, 1800, 2300, -9.8f))
  check(trace(shock, 2400, 3000, -9.8f))

  val gap = armed()
  check(!trace(gap, 1100, 1500, -9.8f))
  check(!gap.update(0f, 0f, -9.8f, 5000)) // missing samples do not count toward hold
  check(!trace(gap, 5100, 5600, -9.8f))
  check(gap.update(0f, 0f, -9.8f, 5700))
  check(!gap.update(Float.NaN, 0f, -9.8f, 5800))
  check(!gap.update(0f, 0f, -9.8f, 5700)) // stale reading
  // A new ring must re-arm; stale orientation from the previous ring cannot silence it.
  val nextRing = armed()
  check(trace(nextRing, 1100, 3000, -9.8f))
  nextRing.reset()
  check(!trace(nextRing, 4000, 7000, -9.8f))
  check(!trace(nextRing, 7100, 8500, 9.8f))
  check(trace(nextRing, 8600, 10500, -9.8f))

  println("Flip detector tests passed: arming, hold, reset, vibration, tilt, brief flip, shock, gaps, invalid/stale samples")
}
