# Flip to Silence: Matrix 1.1.1 preview

Status: native repair prepared; physical Android verification remains required. Do not treat the issue as resolved solely from the automated tests or APK build.

## Investigation and root cause

The existing native code starts the accelerometer after the ringing foreground service starts vibration, reads `matrix.alarm.settings / flipToSilence` with a default of true, and unregisters the listener when the ring stops. React synchronizes the setting through `setFlipToSilenceEnabledAsync`. The silence path calls the existing `stopRinging()`: audio and vibration are stopped, the wake lock and sensor listener are released, the ringing activity receives its close broadcast, and future recurring schedules are not cancelled.

**Confirmed detector defect:** raw acceleration magnitude outside 8–12 m/s² reset the face-down hold immediately. Each subsequent vibration pulse therefore restarted the required uninterrupted 700 ms interval. The alarm itself vibrates for 800 ms with only a 700 ms quiet interval; sample timing/noise can leave no qualifying interval. An added synthetic trace with recurring 13 m/s² pulses and unchanged face-down orientation fails the original detector and passes the repaired one. The original tests used ideal static readings and missed this interaction.

This identifies a reproducible code defect, **not yet the confirmed exact cause on the user's phone**. No phone is attached to ADB, so sensor registration, preference values, and actual locked-screen samples on that device have not been observed. The new native diagnostics distinguish a missing/failed sensor, disabled preference, absent samples, orientation detection failure, and silence execution.

The EAS Matrix 1.1.0 artifact from build `4799fc2c-1dcc-4dc0-9405-94ae7e0ac505` was downloaded and inspected. Its DEX class definitions contain `MatrixFlipDetector`, `AlarmSchedulerRingService`, `AlarmSchedulerRingActivity`, and `AlarmSchedulerModule`, and its native strings contain the preference setter/key and ring-close action. Therefore that artifact contains the previous native patch. Its SHA-256 is `7bde56d7f3ee450a333d0969806a79e8797c6a5693ad7e602f1ad9e3d8521ba5`. The APK installed on the physical phone could not be pulled for comparison.

## Focused changes

- `patches/react-native-alarm-scheduler+1.0.1.patch`: retains the existing plugin fix and other working alarm behavior. The detector now estimates gravity with a sample-rate-aware 150 ms low-pass filter and uses normalized orientation with hysteresis: enter face down at z/gravity <= -0.85, leave above -0.70. The 300 ms arming and 700 ms hold remain. Initially face-down phones do not auto-silence. Large shocks, invalid readings, and sample gaps reset the hold; missing readings never count toward it.
- The service requests a wake-up accelerometer when available, otherwise the normal accelerometer, at 10 Hz during enabled active rings only. Registration results are checked. Logging covers the native revision, preference read/write, registration result/sensor, orientation transitions and occasional samples, locked state, absence of readings for five seconds, unregister, silence, and ringing-activity closure. No reminder titles, note content, or alarm names are logged. A small watchdog exists only while the sensor is registered and is removed on cleanup.
- `test/MatrixFlipDetectorTest.kt`: tests arming, initial face-down pose, hold duration, reset, vibration pulses, tilt, brief flips, strong shocks, sample gaps, and invalid/stale readings. These traces are simulated; they are not captured device readings.
- `scripts/verify-flip-patch.cjs`, `scripts/flip-native-sha256.json`, and `package.json`: postinstall fails on patch errors and verifies exact hashes for the four native source files before native compilation.
- `scripts/inspect-flip-apk.py`: verifies actual DEX class definitions and native diagnostic markers in a built/pulled APK, without installing it.
- `app.json`: version 1.1.1 creates a separate appVersion runtime for this native release. `eas.json`: preview builds increment Android version codes. Package ID, app icon, stored-data keys, React UI, reminder/notification controls, recurrence logic, notes, Home behavior, and settings defaults are unchanged by this repair.

Android's official guidance describes [isolating gravity with a low-pass filter](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion#sensors-motion-accel) and [using a foreground service for sensor access outside the foreground screen](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview#sensors-practices). This repair uses the existing native ringing service rather than adding another service or requiring a React screen.

## Validation

- `npm run postinstall`: patch applied and all four source hashes verified.
- `npx expo lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: all 12 existing tests passed.
- `npm run test:flip`: expanded Kotlin detector tests compiled and passed. The vibration regression was observed failing against the previous implementation first.
- Full Android native compilation: EAS preview build [5e3bf361-9450-4627-ba71-16e3555e490f](https://expo.dev/accounts/hotrodtymn/projects/matrix/builds/5e3bf361-9450-4627-ba71-16e3555e490f), version 1.1.1, version code 2. **FINISHED**. EAS logs contain the source-hash verification, `:react-native-alarm-scheduler:compileReleaseKotlin`, and `BUILD SUCCESSFUL in 8m`. The signed APK is [available here](https://expo.dev/artifacts/eas/fjDSj-bAchFYob6FoYnrvt5hICweqfbFmAjIY1Fuw0M.apk).
- Finished APK inspection: all four compiled DEX class definitions and all `flip-v2` diagnostic markers were present. `python3 scripts/inspect-flip-apk.py /private/tmp/Matrix-1.1.1-preview.apk --require-v2` passed. APK SHA-256: `3c7c78dc6e382cb387c6408bd6f3f42442d0739a83b4960c44f1441b6d22db50`.
- Physical device: not verified; `adb devices` reported no connected device.

## Device verification

Install the new signed preview APK over the existing app to preserve its data. Do not uninstall or clear storage. This is a native APK repair; no OTA update is used.

1. Check that the phone runs version 1.1.1 / version code 2:

   ```sh
   adb shell dumpsys package com.hotrodtymn.matrix
   ```

2. Start targeted logging before toggling the preference and ringing an alarm:

   ```sh
   adb logcat -v time MatrixFlip:I '*:S'
   ```

3. Enable Flip to Silence. Expect `flip-v2 preference enabled=true saved=true`. When the ring starts, expect `start active=true enabled=true` and `registered=true`. Verify live samples and the `locked` value.
4. Leave the phone face up/upright for about one second after ringing starts, turn it face down, and hold it there for about two seconds. Expect `armed`, `face-down-hold`, `silence requested`, `unregister sensor`, `closing ringing activity`, and `silence complete audio=false vibration=false`. Confirm the sound and vibration actually stop and the ring screen closes. The close and completion log ordering can vary because the broadcast is asynchronous.
5. Repeat with the screen locked and Matrix's React screen closed, and after terminating the app process without force-stop. Check both default and custom tones, an alarm with vibration, and a recurring alarm. Confirm its next scheduled occurrence still rings.
6. Disable the setting: expect enabled=false and no sensor registration. Check brief movements/tilts and an initially face-down phone do not silence. Test an idle phone has no sensor logging.
7. If it fails, record the phone model, Android version, build version, and the targeted log output. `registered=false`, `accelerometer unavailable`, or `no sensor samples` identify delivery/hardware restrictions; state/sample logs identify detection issues. Logs with no `flip-v2` marker require checking the installed APK first.

To inspect a pulled or downloaded APK:

```sh
python3 scripts/inspect-flip-apk.py /path/to/Matrix.apk --require-v2
```

Android force-stop prevents normal alarm/service behavior. A device without an accelerometer cannot provide this gesture. Vendor sensor/battery policies and the actual locked-screen behavior remain subject to physical testing. No iOS flip implementation is added.
