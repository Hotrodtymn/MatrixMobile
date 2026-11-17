# Phase 2B voice-session investigation

## Evidence and scope

Samsung wake detection and acknowledgment were reported working. The tested command was an alarm request. Phase 2B implements reminders only; alarm voice creation remains unsupported. No numeric Android error, exception or full status from that device was supplied, so the precise device failure is not established.

Previously native VoiceCommandCycle.error labeled recognition, TTS, parser and bridge failures VOICE_SESSION_ERROR. A recognized alarm request follows onResults -> transient React Native parser request -> existing reminder parser rejection -> native reject -> generic error. This is a possible path for the reported request, not proof recognition succeeded. The previous tone occurred before recognizer readiness and did not prove command capture was active.

## Changes

- VoiceCommandCycle.kt: cue only from onReadyForSpeech, separate readiness and capture timeouts, main-thread assertions, per-recognizer callback guards, microphone permission/release checks, stage-specific recognition/TTS/bridge/save errors, numeric Android error and exception-class retention. Cleanup failure blocks further microphone ownership until process restart.
- HeyMatrixService.kt: require AudioRecord release before native recognition; record release completion and failures; preserve ownership guards on failed cleanup.
- VoiceFailure.kt (new): fixed Android recognition-error descriptions, release helper and readiness guard.
- WakeDiagnostics.kt and index.ts: process-memory historical failure snapshot with phase, stage, numeric code, exception class, thread check and wake-release timestamp; no audio or transcript.
- HeyMatrixModule.kt and useHeyMatrixCommands.ts: forward structured parser rejection reason.
- voiceReminderSession.ts: distinguish unsupported alarm requests from ambiguous reminders after existing reminder parsing. Valid reminders mentioning alarms still work. No alarm execution added.
- HeyMatrixSettings.tsx: display current stage and retained failure/release details after passive recovery.
- VoiceFailureTest.kt (new) and voiceReminderSession.test.cjs: regression coverage for error mapping, release failure, readiness cue guard, retained diagnostics and unsupported alarms.
- app.json: app version 1.4.1; version-based runtime isolates the changed native bridge.

No dependencies, engines, models, alarm patch, reminder persistence or scheduling changes. Home layout unchanged. Generated native directories remain untracked. Commands still require Matrix visible and unlocked; no background or lock-screen capture workaround was introduced.

## Validation

- TypeScript: passed.
- ESLint: passed.
- Node tests: 50 passed.
- Android JS export: generated .expo/voice-session-fix-export including metadata.json.
- Expo config introspection: passed; microphone foreground service remains non-exported, with RECORD_AUDIO, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE, POST_NOTIFICATIONS and WAKE_LOCK permissions.
- Alarm scheduler patch: all four verification hashes passed.
- git diff --check: passed.
- Expo Doctor: 20/21; existing patch-version recommendations for expo, notifications, task-manager and updates remain. Dependencies were not upgraded.
- Android compileDebugKotlin and testDebugUnitTest attempted: blocked because JAVA_HOME is unset and java is absent. New JVM tests have not executed. Neither native compilation nor Samsung verification is claimed.

## Samsung acceptance test

A new native preview APK is required; no EAS build, OTA, merge or commit was initiated for this fix.

1. Install a newly compiled APK, open Matrix, grant microphone permission, keep the app visible/unlocked and enable Hey Matrix.
2. Say Hey Matrix. Wait for the ready tone, then say: Remind me to call Mom tomorrow at 3 PM. Expect spoken readback, then say Yes after confirmation capture starts. Verify exactly one reminder and its scheduled notification through the existing UI.
3. Repeat with No, silence, ambiguous dates and notification Stop. No unconfirmed reminder may be created; passive wake should recover after ordinary failure/cancellation.
4. Try an alarm request. Expect COMMAND_UNSUPPORTED_ALARM if recognition reaches the parser; nothing is saved. Alarm support needs a dedicated parser/action, explicit confirmation, existing alarm persistence/scheduling integration, permissions and regression tests; it is not implemented here.
5. If capture fails, report Last voice failure code, Android number, phase/stage, exception class, thread flag and release timestamp. These fields contain no transcript. Error 13 indicates unavailable language data; error 12 unsupported language; 3/8 indicate audio/busy errors. These are interpretations for future evidence, not established causes of the original failure.
6. Check an interruption/competing recorder, repeated wake cycles, permission denial, lock/background cancellation and Stop notification with React Native inactive. A cleanup failure intentionally requires force-stop and reopening Matrix rather than risking two microphone owners.
7. Recheck existing manual alarms, flip-to-silence, reminders, notes, timers, theme and Home navigation.
