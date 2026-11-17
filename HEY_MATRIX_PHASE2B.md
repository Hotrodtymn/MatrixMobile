# Phase 2B: foreground hands-free reminders

Implemented source on feature/voice-commands. This is an intended native voice flow,
not a claim of completed Android compilation or Samsung end-to-end acceptance.
No EAS build, OTA publication, merge, new dependency, engine/model/license change.
App version/runtime is now 1.4.0; the additional native methods require a new APK.

## Supported scope and prerequisites

Keep Matrix visible, focused and unlocked while giving and confirming a reminder.
Home contains no voice controls: enabling Hey Matrix once in Settings is sufficient
to use the hands-free flow on Home or another Matrix screen. Native on-device STT
requires Android 12/API 31+ and an installed English recognition model. TTS requires
an installed non-network English voice and nonzero media volume. Notifications
must already be permitted and Matrix notifications enabled; voice saving never
opens a permission dialog or creates a notification-disabled reminder silently.

Passive sherpa-onnx monitoring can continue while other apps are open or the phone
is locked under the existing foreground service rules. Background/locked COMMAND
CAPTURE IS DEFERRED in this release. Such wake events still acknowledge and display
an explicit status explaining that commands require opening/unlocking Matrix.
Nothing launches an Activity, dismisses keyguard or pretends a UI review is voice
confirmation. No sensitive/external/destructive action is supported; only new
one-time reminders can pass the existing reminder parser.

## Actual architecture

The service's worker returns on an eligible wake event. Its finally block releases
AudioRecord, the sherpa stream/model and wake lock BEFORE the main-thread native
VoiceCommandCycle starts. That cycle uses Android's createOnDeviceSpeechRecognizer,
not the Expo speech-recognition wrapper or a background JS capture request. It only
starts with a fresh foreground React heartbeat and an unlocked device. STT has no
online fallback and is destroyed between turns. Native TextToSpeech uses a voice
whose network-required flag is false. Wake detection and existing push-to-talk
retain their engine/library; no wake model files or licensing changed.

TTS initialization completes before the acknowledgment tone so model/voice setup
does not consume the first words after the cue. After the tone, say:
  Remind me to call Mom tomorrow at 3 PM
The existing parser handles today, tomorrow and on YYYY-MM-DD with explicit time.
The readback includes title, full local date/time and timezone, then asks for yes/no.
Recognition starts only after TTS completion and a short output-drain delay.
Only exact English yes (ignoring case and final punctuation) authorizes saving.
No, silence, cancellation, ambiguous input, missing language data, STT/TTS errors,
app backgrounding or locking cannot produce an unconfirmed save.

Native-to-JS requests are transient memory-only records scoped to a UUID. JS calls
parseVoiceReminder, retains one proposal, and returns the readback. A save request
is emitted only after native explicit Yes. The JS handler matches the proposal
exactly, rechecks native authorization, consumes it once, and invokes commitReminder.
The global hook remains mounted regardless of navigation and keeps its heartbeat
independent of slow save operations. It renders no voice UI.

commitReminder was extracted from App.tsx: both manual editor and voice use the
same scheduling, AsyncStorage persistence, mutation serialization, merge behavior,
replacement alert cleanup and failure rollback. It uses scheduleReminder and the
existing STORAGE_KEY, not a parallel database. Voice IDs are stable per session;
duplicate requests cannot create duplicate reminders. The manual editor retains
its existing validation/permission dialogs and save feedback. Notification actions,
alarms, flip-to-silence, notes, timers, themes and safe areas retain their own paths.

## State machine and bounds

PASSIVE_WAKE → COMMAND_CAPTURE → CONFIRMATION → SAVING → RETURN_TO_WAKE → PASSIVE_WAKE
Error paths use ERROR → RETURN_TO_WAKE. Native VoiceFlow rejects illegal transitions
and SAVING without explicit Yes. Each new session resets confirmation authorization.

- COMMAND_CAPTURE: offline TTS initialization up to 10 seconds, acknowledgment,
  recognition up to 12 seconds, JS parsing up to 5 seconds.
- CONFIRMATION: readback up to 30 seconds, then response capture up to 8 seconds.
- SAVING: up to 15 seconds awaiting the shared commit result; successful persistence
  is followed by spoken Reminder saved, then return to wake. Confirmation is never
  inferred from noise, interim recognition, TTS text or a UI click.
- RETURN_TO_WAKE: destroy STT/TTS and release audio focus, wait 500 ms, then restart
  the native wake worker. ERROR retains a fixed diagnostic status, recovers after
  700 ms, and never retries a save automatically.

Cancellation is checked before scheduling and again immediately before storage
commit. If cancelled during scheduling, alerts are rolled back. Once the explicitly
confirmed storage write has begun, stopping cannot atomically retract that write.
A late/failed save acknowledgment reports uncertainty and asks the user to check
reminders; it does not silently retry. Process death after scheduling but before
persistence is not transactional across Android notifications and AsyncStorage,
an existing storage limitation; interruption tests must include this window.

Existing Stop Listening disposes any active cycle and prevents passive restart.
Permission removal, calls, microphone interruption and alarms still stop the service
as before; those service-level interruptions require manual re-enable. No restart
after force-stop/reboot is introduced. Native callback identity checks discard stale
recognition results; utterance IDs and timeouts discard stale TTS callbacks.

## Privacy and diagnostics

Settings and the ongoing notification expose fixed phase/status text. Native logs
contain phase names, existing technical state and fixed error codes, never command
text/readbacks/transcripts/PCM. Recognition results and the single proposal exist
only in memory until consumed, replaced or process/root-hook teardown. The saved
reminder title/date are intentional reminder data after confirmation, not a stored
raw command transcript. No microphone audio is recorded to files or uploaded by
Matrix. Errors may be status-only if speech output is unavailable.

## Validation

- TypeScript and Expo lint pass. All 48 Node tests pass, including existing 39 plus
  shared commit idempotency, rollback on cancellation/write failure, unrelated-data
  preservation, invalid/deleted data and proposal/authorization matching.
- Native VoiceFlowTest covers exact yes, rejection of no/ambiguous confirmation,
  reset, illegal transitions and error recovery; it is included but NOT run locally.
- Android Hermes export and native config introspection pass. Manifest retains the
  microphone foreground service and adds only TTS service visibility queries.
- Alarm patch hashes pass; native patch/model artifacts and dependencies unchanged.
- Expo Doctor passes 20/21: the same existing Expo/notifications/task-manager/updates
  patch recommendations remain, with no unrelated upgrades.
- Local compileDebugKotlin/testDebugUnitTest were attempted but cannot start:
  JAVA_HOME is unset and java is unavailable. New Kotlin compilation and Samsung
  testing are NOT verified. A previous successful APK does not validate these changes.

Native API sources checked:
https://developer.android.com/reference/android/speech/SpeechRecognizer
https://developer.android.com/reference/android/speech/tts/TextToSpeech
https://docs.expo.dev/versions/v57.0.0/

## Samsung acceptance gates for a future APK

1. Open Matrix and enable Hey Matrix in Settings. Confirm PASSIVE_WAKE and increasing
   capture/decoder counters. Home must remain free of voice controls.
2. On Home while unlocked, say Hey Matrix, wait for the tone, then the example command.
   Hear the correct full readback, say yes after the prompt; expect one reminder,
   one scheduled notification, spoken success and PASSIVE_WAKE. Refresh/restart and
   verify reminder persistence and eventual notification delivery.
3. Repeat with no, silence, cancel, invalid date/time, missing AM/PM, unsupported
   actions and yes please; none may save. Repeating yes/results must not duplicate.
4. Lock or background during initialization, capture, readback, confirmation and
   scheduling. No unconfirmed reminder may be saved; check the documented commit
   boundary after explicit Yes. Passive wake should return unless the service stopped.
5. Test muted media, unavailable/offline language models, unavailable local TTS,
   audio-focus denial, Bluetooth routes, calls, alarms, mic privacy switch, revoked
   notification/mic permission, Stop Listening and process kill. Verify microphone
   ownership and resource cleanup, no auto-save/retry, and actionable diagnostics.
6. Wake while locked or in another app: no command recognition, private readback,
   activity launch or saving is allowed. Status must explain the deferred capability.
7. Regression-test manual reminder creation/editing/recurrence, notification actions,
   flip-to-silence while locked, alarms/timers, notes, themes and navigation.
8. With airplane mode and required language/voice packs installed, repeat positive
   and negative flows. Inspect only HeyMatrix diagnostics, never record user audio.

## Exact changed files

- App.tsx
- app.json
- src/hooks/useHeyMatrixCommands.ts
- src/services/reminders.ts
- src/services/voiceReminderSession.ts
- src/components/HeyMatrixSettings.tsx
- modules/hey-matrix/index.ts
- modules/hey-matrix/app.plugin.js
- modules/hey-matrix/android/src/main/java/expo/modules/heymatrix/HeyMatrixModule.kt
- modules/hey-matrix/android/src/main/java/expo/modules/heymatrix/HeyMatrixService.kt
- modules/hey-matrix/android/src/main/java/expo/modules/heymatrix/VoiceCommandCycle.kt
- modules/hey-matrix/android/src/main/java/expo/modules/heymatrix/VoiceFlow.kt
- modules/hey-matrix/android/src/test/java/expo/modules/heymatrix/VoiceFlowTest.kt
- test/heyMatrix.test.cjs
- test/reminders.test.cjs
- test/voiceReminderSession.test.cjs
- HEY_MATRIX_PHASE2B.md
