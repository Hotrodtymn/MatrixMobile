# Voice removal and alarm restoration — 2026-11-18

## Baseline and backup

Work remains on feature/voice-commands. The initial working tree was clean. Backup branch backup/voice-before-removal-2026-11-18 points to 5452b3245fee7af8d9182d99b7b1f7c5700742b4 and retains the entire experiment, models, historical reports and tests. No reset, merge, backup deletion or commit was performed.

Selected pre-voice baseline: 5874270 (last commit before abcfe52, Phase 1 voice). This is also main's current tip, but it was selected by reviewing history and content, not by assuming main was stable. Its alarm implementation comes from fdc9ac4. FLIP_TO_SILENCE_FIX.md records a finished 1.1.1 native build (5e3bf361-9450-4627-ba71-16e3555e490f), APK DEX/flip-v2 inspection and successful detector traces in the earlier environment. That report explicitly leaves physical Samsung acceptance outstanding. There is no evidence for a fully device-verified pre-voice release; this is the last build-verified pre-voice implementation.

## Exact changes

- App.tsx: remove voice imports, root session hook, transcript state, microphone/editor entry and Settings control. Preserve manual editor and the later transactional commitReminder integration.
- app.json: remove both voice plugins and speech permission descriptions; retain alarm and notification plugins, package com.hotrodtymn.matrix and project identity. Version 1.5.0 isolates this native runtime through the unchanged appVersion runtime policy.
- package.json/package-lock.json: remove only expo-speech-recognition (57.1.1). Existing versions, package scripts and patch postinstall remain.
- Delete modules/hey-matrix/ in full: native service, bridge, Gradle configuration, manifests, config plugin, local module registration, sherpa AAR/models/tokens/keywords, license and wake/session tests.
- Delete src/components/HeyMatrixSettings.tsx, src/components/VoiceCommand.tsx, src/hooks/useHeyMatrixCommands.ts, src/services/voiceCommand.ts and src/services/voiceReminderSession.ts.
- Delete scripts/verify-hey-matrix-model.py and test/heyMatrix.test.cjs, test/heyMatrixStop.test.cjs, test/voiceCommand.test.cjs, test/voiceReminderSession.test.cjs.
- Delete obsolete experiment reports: VOICE_COMMANDS_PHASE1.md, HEY_MATRIX_PHASE2A.md, HEY_MATRIX_PHASE2B.md, HEY_MATRIX_DIAGNOSTICS.md and HEY_MATRIX_VOICE_SESSION_FIX.md. They remain on the backup branch.
- src/services/reminders.ts: remove voice authorization callback plumbing/comments, preserve serialized editor saves, duplicate-ID protection, fresh-storage merge, validation, notification rollback and replacement cleanup.
- test/reminders.test.cjs: retain manual transaction tests; remove the voice-cancellation-only test and rename stable-ID coverage.
- test/flipIntegration.test.cjs (new): native preference bridge success/refusal/errors, unsupported-platform/old-binary behavior and static native silence-path contract.
- test/MatrixFlipDetectorTest.kt: add a second-ring reset/re-arm regression.
- test/run-flip-tests.cjs: recognize the Kotlin stdlib path on Windows as well as Unix.
- This report: VOICE_REMOVAL_RESTORATION.md.

The ignored android directory was regenerated using expo prebuild --clean --platform android --no-install after verifying its resolved path. No generated native directory is tracked. Prebuild's automatic package script changes were undone. No existing ios directory was present. No EAS build, OTA publication, uninstall or data-clear action was initiated.

## Preserved behavior and Flip to Silence trace

The alarm patch, four source hash values, native preference bridge, notification task, task management, note storage, recurrence/scheduling functions, safe areas, themes, calendar, timers, stopwatch and alarm scheduling UI are unchanged from pre-voice code. Compared with 5874270, the only application behavior retained from later work is the hardened editor save transaction. Once/daily/weekly/monthly/selected-day reminder logic and notification actions remain; no Android package or AsyncStorage key changed. Old stored voice preferences, if present on a device, are inert and are not deleted or migrated.

Flip to Silence is present/restored in the voice-free code, not newly proven on Samsung:

1. React synchronizes flipToSilence through setFlipToSilenceEnabledAsync after settings load and on toggle; native SharedPreferences default to true.
2. AlarmScheduler.handleTriggered schedules the next repeating occurrence before starting AlarmSchedulerRingService.
3. The active ring starts the existing foreground service, audio, vibration and wake lock. It registers a wake-up accelerometer where available, otherwise a normal accelerometer, at 10 Hz only when an alarm is active and Flip to Silence is enabled. Preference changes refresh registration.
4. MatrixFlipDetector uses the existing 150 ms gravity filter, orientation hysteresis, 300 ms arming and 700 ms face-down hold. Initially face-down phones do not auto-silence. Vibration, shocks, gaps and invalid readings have dedicated synthetic tests.
5. Detection invokes stopRinging, which stops/releases audio, cancels vibration, restores volume, unregisters sensors/watchdog, releases the wake lock, clears the active ring and closes its activity. It does not cancel/delete the scheduled alarm or call completion/backup rescheduling. Future repeats remain scheduled.
6. Stop/destruction unregister sensors and preference listeners. Existing MatrixFlip flip-v2 diagnostics remain available.

No new native detector defect was established during removal, so the previously compiled patch was preserved byte-for-byte rather than changed speculatively. A fallback notification without a running native ringing service cannot provide this gesture.

## Validation

- TypeScript: passed.
- Expo lint: passed.
- Node tests: 33 passed (including new bridge/static-contract regressions and retained reminder/task tests).
- npm run postinstall: patch-package applied react-native-alarm-scheduler+1.0.1; all four native source hashes passed. Patch and verification files are byte-identical to the pre-voice baseline.
- Kotlin detector suite: attempted, blocked because Kotlin compiler artifacts are not cached. Added second-ring test has not executed.
- Android Kotlin compilation: attempted via android/gradlew.bat -p android :app:compileDebugKotlin; blocked because JAVA_HOME is unset and java is absent. No native compilation success is claimed.
- Clean Android prebuild, Expo config introspection and Expo module autolinking: passed. Checked generated application manifest/config/autolinking for Hey Matrix, speech recognition, TTS queries, RECORD_AUDIO and FOREGROUND_SERVICE_MICROPHONE: none remain. Alarm library manifest retains its specialUse foreground service, wake lock, vibration, reboot and full-screen permissions. Gradle still uses standard autolinking with no local voice module/plugin.
- Android Hermes export: passed to .expo/voice-removal-export.
- Expo Doctor: 20/21; existing patch mismatches remain: expo 57.0.27/~57.0.33, notifications 57.0.22/~57.0.25, task-manager 57.0.21/~57.0.23, updates 57.0.25/~57.0.28. No unrelated upgrades.
- Dependency uninstall audit reports 39 findings (12 moderate, 27 high); no audit fixes or unrelated dependency changes applied.
- git diff --check: passed.

## Safe preview installation and Samsung acceptance

A new native APK is required. These steps are for a later authorized build; no build was started here.

1. Before replacing the APK, note the installed version/versionCode and confirm important alarms, notes and reminder details in the existing app. Avoid installing during an active ring or immediately before an important alarm. Stop Listening on the experimental notification if it is running.
2. Build the current voice-free source with the existing preview EAS profile and the existing Matrix Android keystore. Preserve com.hotrodtymn.matrix. The preview profile uses remote version codes and autoIncrement; verify the produced code exceeds the installed APK's actual code. Do not install an older baseline APK or use downgrade flags.
3. Confirm the artifact is version 1.5.0 and signed with the same certificate. The new appVersion runtime prevents old voice-runtime updates from loading. Keep all current package/storage keys. Install the signed APK over the existing app (Samsung Update, or adb install -r PATH_TO_APK). If Android reports signature/version incompatibility, stop and check credentials/version; do not uninstall or clear storage.
4. Open Matrix after updating. Confirm notes, calendar, reminder recurrence, alarms, theme and settings survived. Verify notification, exact-alarm and full-screen access as applicable. Check no Hey Matrix notification, toggle or microphone UI remains.
5. Enable Flip to Silence. Create a disposable alarm a few minutes ahead; do not edit critical alarms for testing. Keep the phone face up/upright for about one second after ringing begins, then turn face down for two seconds. Sound AND vibration should stop and the ringing screen should close.
6. Repeat locked/screen off, app backgrounded, default/custom tone and with vibration. Test an initially face-down phone, brief tilt, disabled toggle and repeated rings. Ensure no sensor activity while idle. Force-stop is not a valid background-alarm guarantee.
7. Test a recurring alarm, silence one occurrence, and verify the next scheduled occurrence still rings and its enabled state/weekday settings remain. Physical delivery is required to establish this; source tests alone cannot.
8. If flip fails, capture adb logcat -v time MatrixFlip:I '*:S'. Look for flip-v2 preference enabled=true saved=true, start active=true, registered=true, armed, face-down-hold, silence requested, unregister sensor and silence complete audio=false vibration=false. Record model, Android version and app version. Missing sensor samples/registration indicate a different problem from detection or silence cleanup.
9. Verify reminder once/daily/weekly/monthly/selected-day delivery and Complete/Delete/Snooze while foreground/background/locked; check the next recurring occurrence persists. Recheck timer, stopwatch, notes, calendar, task management, light/dark themes and narrow-screen safe areas.

Android force-stop, denied permissions, missing accelerometer and Samsung battery/sensor restrictions remain device-dependent limitations. No physical Samsung testing was performed in this environment.
