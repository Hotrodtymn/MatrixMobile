# Notification, scheduling, and alarm changes

Implemented in source; release acceptance still requires a native build and physical Android testing. The app icon remains pending and unchanged.

## Changes

- `src/services/reminders.ts`: shared notification content, serialized action handling, persistent delivery receipts, scheduling/cancellation, and Home visibility. Completion retains recurring OS requests and records which occurrence was cleared. Snooze schedules a stable OS request using the duration in Settings. Delete cancels all associated pending requests, including snoozes. Existing pending generic notification text is refreshed under the same identifiers where its trigger can be reconstructed; already delivered notifications keep their cached OS text. Legacy iOS snoozes whose delivery time cannot be reconstructed retain their text until delivery.
- `src/services/notificationTask.ts` and `index.ts`: Android task definition and registration before React mounts. The handler accepts native `dataString` payloads as well as decoded listener payloads. Launch responses and foreground listeners use the same implementation. iOS actions open the app to execute the handler.
- `src/components/WeekdaySelector.tsx`: shared accessible weekday selection. Persisted weekdays use JS convention, Sunday=0. Native Android alarms receive Monday=1 through Sunday=7; Expo weekly triggers receive Sunday=1 through Saturday=7.
- `App.tsx`: one-time/daily/selected-day alarms; selected-day reminders, editing, description inputs, Home completion, expired-alarm filtering, safe areas, keyboard avoidance, compact forms, and Flip to Silence settings. Alarm editing attempts to restore the old schedule if replacement fails.
- `patches/react-native-alarm-scheduler+1.0.1.patch`: retains the existing config-plugin fix and adds Android sensor handling to the existing ringing foreground service. Listeners run only during an enabled active ring, stop on silence/destruction, and react to setting changes. A stable non-face-down reading arms detection; a stable face-down reading for 700 ms stops playback/vibration and closes the native ringing activity without cancelling future repeats. The preference defaults to enabled and persists natively for rings that start without JavaScript.
- `app.json`: notification plugin and version 1.1.0. The existing appVersion runtime policy isolates this native release from older APKs. Android package and icon paths are unchanged.
- `package.json`, `package-lock.json`, and `eslint.config.js`: SDK-compatible TaskManager and lint tooling, plus repeatable validation commands. Expo Sensors was investigated but is not a dependency: Android detection lives in the existing service.

Storage keys are unchanged. Missing recurrence defaults to once for reminders; missing alarm weekdays preserves the existing daily behavior. An empty alarm weekday array means once. New reminder fields are optional. Notes are not migrated or reset. A delayed UI save merges only its changes into fresh storage to preserve notification completion/deletion.

## Validation performed

- `npm test`: notification actions, persistent deduplication, native background payload decoding, weekday conversion/cancellation, recurrence across a week boundary, Home visibility, stale UI writes, replacement request preservation, and legacy pending text.
- `npm run test:flip`: compiled and ran the actual Kotlin detector with cached Kotlin compiler dependencies. Covers initial face-down state, arming, hold duration, reset, and shock rejection. The runner needs a cached Kotlin compiler in the local Gradle cache.
- `npx expo lint` and `npx tsc --noEmit`.
- `npx expo export --platform all --output-dir /private/tmp/matrix-final-export`: Android and iOS Hermes bundles. This is a JavaScript bundle check, not an APK/IPA build or a native compilation check.
- `adb devices`: no connected devices available.

## Build and platform limits

A **new Android APK is required** for TaskManager, notification plugin configuration, and the native alarm patch. Do not ship the whole change as an OTA update to the old runtime. Once the 1.1.0 native runtime is installed, UI and scheduling JS changes can use its matching OTA channel.

Use the existing EAS preview profile to produce a test APK:

```sh
npx eas-cli@latest build --platform android --profile preview
```

No cloud build, signing, submission, or publication was performed. The complete native patch has not been compiled in an Android app build; only its pure Kotlin detector has been compiled/tested. Existing alarm functionality already requires a development/standalone build rather than Expo Go.

Flip detection is implemented in the Android ringing service to avoid depending on a foreground React screen. **Background, cold-start, and lock-screen flip behavior are not device-verified.** It requires a working accelerometer and a running ringing service. Android force-stop, denied permissions, and vendor battery restrictions can prevent scheduling/service/task execution. There is no iOS flip-to-silence implementation; iOS alarm fallback uses notifications, whose system sound cannot be controlled by this Android service.

Recurring alarms continue to use the library's native reboot/timezone recovery. Expo scheduled reminder recovery remains subject to OS permissions and scheduling behavior. No unconditional force-stop/reboot guarantee is made. Selected weekdays apply by local wall-clock time at scheduling; travel across timezones and daylight-saving changes need device verification.

## Physical Android acceptance checklist

- Install the new APK over the existing app without clearing data; confirm notes, reminders, alarms, repeat settings, and completion states survive.
- Grant notification, exact-alarm, and full-screen permissions as applicable. Test denied permissions and recovery.
- For each of the three visible buttons (Completed, Delete, Snooze), test foreground, background, locked screen, and process termination without force-stop. Reopen the app and verify persisted results. Check no action repeats on a second launch. Test Settings snooze durations 5/15/60 minutes and tomorrow, and a snooze of a snoozed alert.
- Check recurring completion before and after its due time; only the current occurrence clears, and the next one still fires. Delete a reminder with a pending snooze and confirm both schedules disappear.
- Check once, daily, and Mon/Wed/Fri alarms; Tue/Thu reminders; edit selected days; restart; reboot; change timezone and cross DST. Inspect scheduled notifications for duplicates and verify the old schedule stops after edits/deletion.
- Check Home at occurrence time, after completion, after alarm expiry, after midnight, and on resume. Confirm configurations remain on their respective pages.
- Verify notification name/description and absent-description behavior, including migrated pending alerts.
- Ring an alarm, turn face down, and hold. Verify sound and vibration stop, the native screen closes, and the next repeat remains scheduled. Repeat from lock screen/background/cold start, with setting disabled, with phone initially face down, and with minor motion. Verify no detection while idle.
- Check the reminder form in light/dark themes on a typical phone, with camera cutout/navigation bars, keyboard, landscape, small screen, and large accessibility text. Save and Cancel must remain reachable by scrolling when needed.
- Perform iOS scheduling/edit/delete smoke tests on a compatible native build; confirm unsupported flip control is disabled.
