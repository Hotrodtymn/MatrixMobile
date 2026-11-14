# Matrix

**Matrix** is an in-development personal productivity and reminder application built with React Native and Expo. It focuses on on-device reminders, notes, and time-management tools, with Android as the primary development and testing platform.

> **Status:** Active development. Android builds are the primary target; iOS behavior and release readiness are not yet verified.

## Features in the current codebase

- Create reminders with one-time, daily, weekly, selected-day, monthly, or yearly recurrence.
- Manage separate tasks with optional due dates/times, priorities, filters, completion, and editing.
- Organize reminders with Today, All, Starred, and Completed views.
- Track completion and subtasks.
- Receive local reminder notifications with actions to complete, delete, or snooze.
- Configure the default snooze duration in Settings; legacy action identifiers remain supported.
- Schedule one-time or selected-weekday native Android alarms, with Flip to Silence diagnostics.
- Create and manage locally stored notes.
- Configure preferences including notifications, default snooze interval, week start, completed-item visibility, and theme.
- Alarm, timer, and stopwatch UI functionality in the application code.

Notification timing, action availability, and alarm behavior depend on the device, Android permissions, operating-system restrictions, and build configuration. Not every feature is verified across platforms.

## Technology

- React Native 0.86 and React 19
- Expo SDK 57 and TypeScript
- Expo Notifications and Expo Updates
- AsyncStorage for on-device data
- React Native Safe Area Context and native date/time picker
- React Native Alarm Scheduler integration

## Development setup

Install Node.js 24 or newer and npm (local validation used Node.js 24). This project uses native modules, so use a compatible native development build for testing functionality that Expo Go cannot support.

```bash
npm ci
npm run start
```

To launch Android development:

```bash
npx expo start --dev-client --android
```

The repository also defines `npm run ios`, but iOS support has not been validated. Native builds require the relevant Android/iOS tooling or Expo Application Services (EAS).

## Android preview builds

The `eas.json` configuration includes `development`, `preview`, and `production` profiles. The preview profile is configured to produce an Android APK for internal distribution.

With the EAS CLI installed and the project configured under your own Expo account:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Expo OTA updates are configured. An OTA update cannot replace a native rebuild when native dependencies or native configuration change.

## Local data and permissions

Reminders, notes, settings, and alarm records are stored on-device with AsyncStorage. This is not a cloud-synced account system. Removing application data or uninstalling the app may remove stored records.

Android notification permission, battery restrictions, and alarm scheduling capabilities can affect delivery. Test notification actions and recurring schedules on an actual device before relying on them for time-critical alerts.

## Project files

- `App.tsx` — existing main UI and menu integration
- `src/` — task model/storage/page/form and shared reminder/notification services
- `patches/` and `scripts/` — native alarm patch and reproducible patch verification
- `test/` — task/reminder tests and optional Kotlin detector tests
- `app.json` — Expo app identity, native configuration, and update settings
- `eas.json` — development, preview, and production build profiles
- `index.ts` — Expo application entry point

## Roadmap

Continue refining notification reliability, usability, and cross-platform support. Future functionality should be considered planned until implemented and verified.

## Move development to Windows

Install Git for Windows and Node.js 24 or newer, then open PowerShell in your projects directory:

```powershell
git clone https://github.com/Hotrodtymn/Matrix-mobile.git
cd Matrix-mobile
npm ci
npm test
npx tsc --noEmit
npx expo lint
```

`npm ci` uses the committed lockfile, applies the native alarm patch, and verifies the four patched source hashes. Keep `patches/`, `scripts/`, and `.gitattributes` in the checkout. Git preserves LF line endings for the patch so Windows checkout settings do not change its behavior.

If you already cloned this repository on Windows, use `git pull --ff-only` from a clean checkout, followed by `npm ci` and the checks above. Sign in separately to the same Expo account with `npx eas-cli@latest login` when using EAS. EAS cloud builds avoid a local Android Studio/Xcode setup; the existing standalone preview APK receives compatible JavaScript updates through EAS Update. Metro development requires a native development client; Expo Go cannot load the custom alarm module.

The optional `npm run test:flip` check needs Java and a cached Kotlin compiler in the local Gradle cache. The standard `npm test` suite does not require those tools. Python is only needed for the optional APK inspection script.

## Latest implementation reports

- [Task management phase 1](TASKS_PHASE1.md) — data model, storage, UI, tests, and Android OTA testing commands.
- [Flip to Silence repair](FLIP_TO_SILENCE_FIX.md) — native diagnostics, preview APK provenance, and physical-device test steps.
- [Notification and scheduling changes](DEVELOPMENT_NOTES.md) — earlier implementation details and remaining device checks.

The task feature targets the existing **1.1.1** preview runtime. Its 1.2.0 Phase 1 milestone does not require changing the native app version. Physical-device verification status is recorded in the linked reports.
