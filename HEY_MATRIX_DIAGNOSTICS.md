# Hey Matrix diagnostics and Home shortcut removal

Work stays on feature/voice-commands. The header voice shortcut is hidden on Home
only; the implementation, Settings toggle, and shortcut on other screens remain.
No reminder/alarm/timer/note paths or alarm patch were changed.

## Evidence and limits

Samsung report: saying Hey Matrix gives no response; user reports no notification
or microphone indicator. No device logcat or numeric Settings state is available.
This points investigation at startup, but does NOT establish a device root cause.
Listening defaults OFF and must be enabled from Settings in a visible app session.

Confirmed code weakness: permissions are requested immediately before native start,
which rejects an Activity without window focus. Permission callbacks can arrive
before window focus is restored. The new bounded focus wait retries readiness for
up to two seconds, aborts on backgrounding, and retains native visible-Activity
checks. It does not restart listening from background or bypass Android rules.

Confirmed observability gaps: previously only a general state/counter were exposed;
model initialization, ongoing capture, decoder progress and muted/failed tone were
indistinguishable to the user. Settings now shows stage, service/model/microphone
flags, sample and decode counts, presence of any nonzero input, last capture,
last detection, acknowledgment status and error code. It handles bridge read errors.
The new APIs are optional in JS so old binaries explain missing diagnostics.

## Exact model configuration verified

The engine remains sherpa-onnx 2.0.1; every shipped binary/model hash is unchanged.
No new model, license, activation key, paid service or runtime download was introduced.
The bundled model README identifies English GigaSpeech XL keyword spotting with BPE
units and Apache-2.0 licensing. This is an open-vocabulary KWS model, NOT a classifier
specifically trained on Hey Matrix. Upstream explains that phrases are configured
as token graphs rather than requiring dedicated training:
https://k2-fsa.github.io/sherpa/onnx/kws/index.html

Inspected ONNX metadata: encoder model_type=zipformer2, decoder context_size=2,
vocab_size=500. The bundled bpe.model encodes HEY MATRIX to:
  ▁HE Y ▁MA T RI X
The actual keywords.txt contains exactly:
  ▁HE Y ▁MA T RI X :1.5 #0.35 @HEY_MATRIX
All phrase tokens are present in tokens.txt. Keyword-specific threshold is 0.35
and boost 1.5; the global fallback threshold is 0.25. Native config explicitly uses
16,000 Hz / 80 features, CPU/one thread, four active paths, two trailing blanks,
zipformer2, and the existing int8 encoder/joiner plus FP32 decoder assets.

Using sherpa-onnx 2.0.1 on the Windows host, the shipped files initialized and a
stream was created. An offline Microsoft David synthesized Hey Matrix fixture
triggered HEY_MATRIX; a synthesized unrelated weather sentence did not. This is
positive configuration evidence, not proof of Samsung JNI/AssetManager loading,
real-microphone performance, accent/noise accuracy or locked-screen behavior.
No human microphone audio was captured, stored, uploaded or committed for this test.

scripts/verify-hey-matrix-model.py repeats these checks with explicitly supplied
synthetic 16 kHz mono PCM16 WAV fixtures. Dependencies used only in temporary host
tooling: sherpa-onnx 2.0.1, sentencepiece, onnx, numpy; no app dependencies changed.

## Native changes

WakeModel centralizes explicit parameters and verifies required APK assets and
keyword vocabulary before calling JNI. Failures report a stage and fixed recovery
message. WakeDiagnostics holds only process-memory flags/counters/timestamps.
Logcat tag HeyMatrix emits fixed lifecycle event names, technical initialization
parameters, exception class only, interruption codes and a 30-second heartbeat.
No PCM, decoded transcript, arbitrary recognizer output, tokens, amplitude history
or user-spoken content is logged or persisted. Sherpa debug mode stays disabled.

Tone status distinguishes media-volume zero, audio-focus denial, playback request
and failure. Test acknowledgment tone isolates the output path while listening is
enabled. A successful playback request does not guarantee audible output over a
particular Bluetooth route, muted device or DND configuration.

## Samsung steps (updated APK required)

1. Confirm Home has no voice shortcut. Open Settings; keep Matrix visible and enable
   Hey Matrix. Grant microphone and notifications; close permission dialogs.
2. Expect service started, model loaded, microphone active, increasing capture and
   decode counts, the ongoing notification and Android mic indicator. If absent,
   report the exact startup stage, error code and visible error; do not assume the
   model failed. Try enabling again after dialogs close.
3. Use Test acknowledgment tone with media volume raised. If blocked, inspect the
   tone status and audio route. Speak Hey Matrix, then pause: last detection and
   count should update independently of whether the tone can be heard.
4. If capture is zero/stale, check microphone permissions/privacy switch and other
   apps using the microphone. Nonzero input alone does not prove intelligible speech.
   If decode progresses without detections, test quiet close-range speech before
   noise/distance/accents; do not lower thresholds blindly.
5. Repeat with another app open and PIN-locked/screen off; reopen Settings and inspect
   last capture/detection. Verify cooldown, notification Stop, calls and Matrix alarms,
   flip-to-silence, timers, reminders, notes, themes and safe areas.
6. With USB debugging, capture diagnostic events using:
   adb logcat -s HeyMatrix:I '*:S'
   Share only those diagnostic lines and the Settings fields. Do not capture audio.

No EAS build, OTA publication or merge was performed. Android compilation requires
a configured Java/Android toolchain and is not established by desktop engine tests.

## Validation for this change

- TypeScript and Expo lint pass; 39 Node tests pass, including delayed-focus,
  background-abort, timeout and old-APK compatibility cases.
- Android Hermes export, native manifest introspection and existing asset hash checks pass.
- Offline host engine/model initialization and synthesized positive/negative fixtures pass.
- Alarm patch native source hashes pass; no patch or alarm sources were modified.
- A focused Kotlin WakeDiagnosticsTest is added but unrun: local Gradle compilation
  and native unit tests cannot start because Java/JAVA_HOME and Android tooling are
  unavailable. A prior APK build does not prove these new Kotlin changes compile.
- Expo Doctor passes 20/21; existing Expo, notifications, task-manager and updates
  patch-version recommendations remain. No app dependencies were changed.
- A new APK is required for native diagnostics. No EAS build, OTA or merge was started.
