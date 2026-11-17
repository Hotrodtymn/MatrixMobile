# Hey Matrix Phase 2A

Implementation on feature/voice-commands. This is an experimental native wake-word
prototype, not a verified Samsung acceptance pass. No EAS build, OTA update, merge,
background STT, reminder execution, spoken confirmation or lock-screen bypass.

## Inspection and engine choice

Expo 57.0.27, React Native 0.86.3, expo-speech-recognition 57.1.1. Android is generated
by Expo config plugins and ignored by Git. The installed RN version catalog uses
minSdk 24, target/compile SDK 36; generated app Gradle uses the root SDK values.
Hey Matrix itself gates startup to API 29+ for per-recorder microphone-silencing
callbacks. Older supported devices retain push-to-talk.

Selected sherpa-onnx 2.0.1 official Android AAR: minSdk 21, ARM64/ARMv7/x86/x86_64,
Kotlin KeywordSpotter API present. All four ARM64 native libraries have 16 KB aligned
ELF PT_LOAD segments. This establishes artifact/API suitability; it does NOT prove
full SDK 57 Gradle compilation or Samsung runtime behavior.

Source: https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1
AAR SHA-256: a8d09d1d32f3eb8520482c6d3d43fae674681c5b050385967c70a3c2c9bf0ee7
English model: sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01
Source: https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models
Archive SHA-256: f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a
The model archive README states Apache License 2.0 and GigaSpeech XL provenance.
That original README and the upstream Apache license are retained in the module.
Distribute the notices with these artifacts; do not represent the upstream model
as Matrix-authored. No activation key, paid service, account, or runtime model
download. The AAR is about 47 MiB and selected model assets about 6 MiB in source;
actual APK size depends on compression/ABIs. All assets are pinned in artifacts.sha256.json.

The English BPE model generated the phrase tokens using SentencePiece:
▁HE Y ▁MA T RI X. This is keyword spotting only, not general command transcription.
Sensitivity is a starting value, not a measured accuracy claim. Recognition can be
triggered by anybody or recorded speech. No speaker authentication is provided.

## Behavior and native lifecycle

Settings → Hey Matrix is default OFF and reflects native process state rather than
a persisted checkbox. Start is allowed only with a visible, focused Matrix Activity,
microphone permission, enabled notifications and enabled listening channel. Native
code also checks these conditions; JS alone cannot bypass the start requirement.
The microphone service is private and declared by modules/hey-matrix/app.plugin.js.
Its microphone FGS type and permissions are separate from the existing alarm service.

An ongoing low-importance notification has explicit native Stop Listening and Open
Matrix PendingIntents. Stop works without React mounted. Opening Matrix uses the
normal launcher Activity and never dismisses keyguard. There is no boot receiver,
background auto-start, sticky restart or battery-optimization bypass. A stopped or
killed process must be explicitly enabled again. Recents dismissal is distinct
from force-stop; the existing service can continue after Activity dismissal.

Native 16 kHz mono PCM is processed on one worker, with no audio persisted or sent
to JS/network. Detection increments a counter, attempts a 160 ms acknowledgment
tone at media volume, and suppresses detections for 2.5 seconds before resetting
the stream. Tone can be inaudible at zero media volume or denied audio focus.
Capture stays native when the screen turns off/locks; a partial wake lock supports
processing and increases battery use. Sessions end after eight hours and require
manual restart; the wake lock also has an eight-hour timeout.

Calls/audio-mode changes, alarm playback, microphone silencing/capture errors and
permission/notification removal stop listening with an error state. It does not
automatically resume after interruptions. Stop unblocks AudioRecord; its worker
releases recorder, model, stream and wake lock before ownership is released. Native
process death releases OS resources; no saved ON preference restarts it. Kernel or
OEM killing and unavailable capture cannot be prevented. Some interruptions may
only surface as silence/error on individual devices; test Samsung explicitly.

Push-to-talk first stops the service and waits for native cleanup. It never resumes
wake listening automatically. Original reminders, alarms, flip-to-silence, notes,
timers and theme behavior retain their existing paths. The alarm patch is unchanged.

## Validation and remaining gates

- TypeScript and lint pass; all 35 Node tests pass (30 existing plus five focused tests).
- Android Hermes export passes.
- Native manifest introspection, Android prebuild and Expo module autolinking pass.
- Focused tests check private microphone service/receiver declarations, permissions,
  pinned offline artifacts, keyword vocabulary and microphone-handoff ownership.
- A Kotlin cooldown unit test is included under the module's android/src/test.
- Local :hey-matrix:compileDebugKotlin and :hey-matrix:testDebugUnitTest were attempted
  but Gradle cannot start: JAVA_HOME is unset and java is unavailable. Android SDK
  tooling is also absent. Kotlin compilation and the Kotlin test are NOT verified.
- Existing flip patch hashes pass. Existing Kotlin flip tests require the missing toolchain.
- Expo Doctor: 20/21; same pre-existing Expo/notifications/task-manager/updates patch
  version recommendations as Phase 1. No unrelated dependency upgrades.
- New app version/runtime 1.3.0 requires a NEW APK; current 1.2.0 APK cannot test this.
  No EAS build was started. Generated android/ios remain ignored and untracked.

Before device testing, compile on a configured Android toolchain:
  android/gradlew -p android :hey-matrix:compileDebugKotlin :hey-matrix:testDebugUnitTest
Then validate release native packaging/ABI loading and full app assembly. No claim
of native compatibility or locked-screen success is complete until these pass.

## Samsung device acceptance

- Fresh install: toggle OFF, no microphone indicator/service; denial and permanent
  denial explain recovery. Notification permission/channel denial blocks start.
- Enable visibly, then Home/another app/lock with PIN/screen off: say Hey Matrix;
  observe tone/counter and cooldown, without opening Matrix or creating a reminder.
- Repeat at several distances/accents with fan/TV/music; measure miss rate and false
  wakes over hours. Verify tone never retriggers and that locked UI stays locked.
- Stop from notification with Activity dismissed/React inactive; microphone indicator
  disappears and another recorder can acquire mic. Reopen: toggle truthfully OFF.
- Fast start/stop, background during permission dialog, privacy mic switch, revoked
  permission, disabled notifications, calls, camera/voice recorder, Bluetooth changes:
  no crash, no stale ON state, no unwanted restart or retained audio capture.
- Android Active Apps Stop, force-stop, process kill, reboot, app update: no listening
  restarts automatically. Compare recents dismissal separately from force-stop.
- Default Samsung battery settings, Power Saving, Restricted/Unrestricted, idle and
  overnight lock: record service survival, detection latency, drain and temperature
  against OFF. Verify eight-hour session timeout releases the microphone.
- Existing Matrix alarm rings and flip-to-silence works, including while locked;
  wake service yields. Exercise timers, notes, reminder saving, themes and safe areas.
- Push-to-talk stops wake listening cleanly and still saves only after review/Save.
- Airplane-mode cold start works with bundled models; no audio files or uploads.
