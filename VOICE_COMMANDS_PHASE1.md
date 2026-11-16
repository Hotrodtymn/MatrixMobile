# Phase 1 voice reminders

Implemented on `feature/voice-commands`. Architecture inspected: Expo SDK 57.0.27,
React Native 0.86.3 / React 19.2.3, App.tsx state-based navigation (no Router),
generated native projects (no checked-in android/ios), AsyncStorage reminders,
expo-notifications, and the patched react-native-alarm-scheduler. Existing navigation
is retained. Voice opens the existing reminder editor and uses its addReminder →
scheduleReminder → saveReminders flow; there is no separate voice persistence path.

Dependency: expo-speech-recognition ^57.0.0, locked to 57.1.1. The maintainer's
installation documentation explicitly maps the 57 release to Expo SDK 57:
https://github.com/jamsch/expo-speech-recognition#installation
SDK reference checked: https://docs.expo.dev/versions/v57.0.0/
The config plugin adds RECORD_AUDIO and Android speech-service visibility queries,
plus iOS permission descriptions. This feature's microphone UI targets Android.

Tap the header microphone, Start microphone, speak, and Stop (or let recognition
finish). The recognized text is editable. Review reminder interprets the command
and opens the existing editor with the transcript, title, local date and time.
Only SAVE in that editor creates the reminder. Cancel and Android Back discard voice
input; backgrounding stops recognition. Permission denial links to Android settings.
Old APKs without the module show an explanatory message and allow typed input.

Supported English grammar:
- Remind me to call Mom tomorrow at 3 PM
- Remind me to take medication today at 18:30
- Remind me to renew on 2027-02-01 at 10 AM

Dates use device local time. Missing dates/times, bare hours without AM/PM, invalid
calendar dates/times, past times, nonexistent DST times, and unsupported grammar
require correction. This is a deliberately limited parser; no cloud language model.
On-device recognition is requested whenever the Android service reports support.
Missing language models produce a visible error rather than silently retrying online.
Otherwise Android's default service may use the network, disclosed before recording.
No audio recordings are persisted by this feature.

Validation:
- TypeScript and Expo lint pass.
- 30 Node tests pass (26 existing plus four parser test groups).
- Android Hermes export passes; native config introspection passes, including audio
  permission and recognition-service query. This does not prove native compilation.
- Alarm patch installation and all four native source hash checks pass; patch unchanged.
- Kotlin flip tests cannot run: Kotlin compiler not cached in this environment.
- Expo Doctor: 20/21 checks pass. Existing packages below recommended patches:
  expo 57.0.27 vs ~57.0.33; notifications 57.0.22 vs ~57.0.25;
  task-manager 57.0.21 vs ~57.0.23; updates 57.0.25 vs ~57.0.28.
  No unrelated dependency upgrades were made.
- npm install reports 18 audit findings (15 moderate, three high); no audit fixes applied.

A new preview APK is REQUIRED for the native module and manifest changes. App version
is 1.2.0 so the existing appVersion runtime policy separates this native runtime from
1.1.1. No EAS build or OTA publication was initiated, and no merge was performed.

Device acceptance still required: light/dark themes and narrow-screen/safe-area layout;
permission grant/deny/permanent-deny; online and on-device speech; no-speech/error;
Stop/Cancel/Back/background; transcript corrections; ambiguous date rejection; review
then cancel creates nothing; review then Save creates exactly one reminder that
survives restart and notifies; alarms, notes, timers and navigation remain usable.
