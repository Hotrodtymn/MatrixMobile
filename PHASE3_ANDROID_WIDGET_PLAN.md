# Phase 3 plan: Android Home-Screen Widget

Current status: minimal 0.26.0 compatibility spike prepared and committed on feature/android-home-widget. Automated/configuration checks pass; local native compilation is blocked by the toolchain. The one approved isolated EAS build is submitted and remains queued; compatibility is not established. See the spike results below. The original planning notes are retained as historical context.

## Repository preparation

Verified main at 43126d082ae7a1996bde8e872b832648fd0b20d9 with a clean working tree. origin/upstream was https://github.com/Hotrodtymn/Matrix-mobile.git / origin/main. Fetch returned origin/main at 5874270: local main ahead 11, behind 0. Its remote tip was an ancestor of main, so a normal non-force push was safe and succeeded. A subsequent ls-remote confirmed GitHub main at 43126d0; local/remote counts are now 0/0.

GitHub redirected the existing remote and reported its new canonical URL as https://github.com/Hotrodtymn/MatrixMobile.git. The local remote URL was not edited. Created feature/android-home-widget from main; both point to 43126d0. feature/ios-support remains isolated at e315558. At the original planning checkpoint this plan was the only new file, and no implementation/install/configuration work had occurred. The subsequent minimal spike is documented below. Neither the plan nor spike has been pushed.

## Exact project inspected

Expo 57.0.27, React Native 0.86.3, React 19.2.3, TypeScript 6.0.3. Native projects are generated/ignored. Installed RN version catalog declares min SDK 24, target/compile 36, AGP 8.12.0; ignored Gradle wrapper is 9.3.1. App package is com.hotrodtymn.matrix. Version/runtime is 1.5.0 through appVersion policy. EAS preview uses an APK, existing signing, remote version codes and autoIncrement. Config plugins remain alarm scheduler and notifications only.

AsyncStorage 2.2.0 holds reminders, alarms, notes/settings and tasks; reminder lists use their additive versioned catalog. Existing readDashboard, todayReminders, overdueReminders, nextAlarm and priority/list helpers supply the UI. Notification actions use a shared serialized reminder queue and an entry-point TaskManager definition; widget work must not interfere with it. Android ringing/Flip to Silence lives in the patched native alarm service. Keep the patch/postinstall/hash verifier unchanged. Navigation is state-based in App.tsx, with no configured widget deep link and no Router migration planned.

Samsung acceptance recorded in prior reports is user-reported and limited to the supplied Phase 1/2 checks. It is not widget verification or independent identification of an installed build number.

## Recommendation and compatibility gate

Primary candidate: react-native-android-widget 0.26.0, currently published, MIT licensed, no activation key/cloud service. The project documents New Architecture and Expo config-plugin support. Its published peers accept expo >=54 and arbitrary React/RN versions; that is eligibility, not proof of compatibility. Tagged 0.26.0 example uses Expo ~58.0.20 / RN 0.88.0. Tagged 0.25.0 example uses Expo ^55.0.27 / RN 0.83.6. Neither is an exact Matrix SDK 57/RN 0.86 test. Prefer evaluating the maintained current release before selecting a final lockfile pin; do not upgrade Matrix to SDK 58 just for this feature.

Do not select expo-widgets based on latest/unversioned documentation: the versioned SDK 57 page explicitly supports iOS only. The newer Android documentation is not SDK 57 compatibility evidence.

Gate before feature implementation: in the feature branch, later install an explicit candidate with npx expo install, inspect dependency/manifest diff, generate clean Android config, and actually compile a minimal static widget against this project's locked toolchain. Test headless rendering and cold-launch tap on Samsung. No compatibility success is claimed yet. If codegen/Gradle/React renderer incompatibility appears, stop and report; do not disable New Architecture, change the alarm patch or silently upgrade Expo. Fallback for approval is a small local Expo module plus Android AppWidgetProvider/RemoteViews (or AndroidX Glance), which avoids the third-party renderer but requires more Kotlin and native data/refresh work. No alternative package was installed.

Sources: [SDK 57 widgets](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/), [library documentation](https://saleksovski.github.io/react-native-android-widget/), [release notes](https://github.com/sAleksovski/react-native-android-widget/blob/master/CHANGELOG.md), [0.26.0 package](https://github.com/sAleksovski/react-native-android-widget/blob/v0.26.0/package.json), [tagged Expo example](https://github.com/sAleksovski/react-native-android-widget/blob/v0.26.0/example-expo/package.json).

## Proposed first widget

One read-only Matrix Today widget, initially approximately 4x2 with resize support: date, incomplete reminder/overdue counts, a few priority-ordered reminder rows, and next calculable enabled alarm. Include empty/error/stale states, readable light/dark colors and last-updated time. Retain existing monthly-display and DST-unknown rules; never invent an alarm time or imply the widget confirms OS delivery. No complete/snooze/delete/ring-stop controls in the initial increment. Users add it through Samsung's widget picker; optional pin request can follow after the basic flow works. No initial per-widget configuration activity or storage schema is needed.

The candidate renders views as widget images, so launcher size calibration, font scaling, click hit targets and TalkBack need physical testing. Existing React Native View/Text components are not directly interchangeable with its widget primitives. Source: [library limitations](https://saleksovski.github.io/react-native-android-widget/docs/limitations).

## Native requirements

The package/config plugin generates an AppWidgetProvider receiver class, provider XML, preview/description resources and widget RemoteViews integration, and registers its collection service. RN autolinking/codegen adds the native library; its Gradle uses WorkManager. Inspect all generated components, exported flags, BIND_REMOTEVIEWS protection and transitive versions. Do not hand-edit or track android/ios. No microphone, speech, sensor listener, exact alarm or persistent foreground service is needed for widget display; retain existing permissions required by real alarms. Isolate imports/registration to Android and leave iOS feature work untouched.

Register the widget task handler at index.ts alongside, not instead of, current notification-task registration. Handle add/update/resize/delete/click without mounting React UI or running app initialization, requesting permissions or invoking migrations. The standard package/plugin should avoid custom Kotlin for the basic widget; targeted native broadcasts/deep-link changes may be needed if the compatibility spike identifies a gap. Source: [0.26.0 plugin](https://github.com/sAleksovski/react-native-android-widget/blob/v0.26.0/app.plugin.ts).

## Data synchronization and refresh

1. Keep existing AsyncStorage records as the only source of truth. Reuse readDashboard and existing occurrence/priority selectors; no second reminder store or native access to undocumented AsyncStorage database files. Audit imports for headless-safe behavior. If pure domain helpers need separating from notification setup, preserve their exports and test behavior; never duplicate recurrence calculations in Kotlin.
2. Read fresh persisted data on every widget render event. Reject malformed/unsupported data without rewriting it. Keep the launcher-rendered prior snapshot with an honest stale/error indication if reads fail. No raw note text, titles or transcripts in diagnostic logs.
3. Trigger a debounced/coalesced refresh after successful reminder saves/metadata/list changes, completion/delete/snooze actions, alarm saves/toggles/deletes and relevant theme changes. Request refresh after persistence, outside scheduling/critical mutation completion. Catch widget failures independently so they cannot fail an alarm/reminder save or notification action. Prevent refresh loops and stale asynchronous render overwrites.
4. Use updatePeriodMillis of at least 30 minutes as a best-effort fallback, plus add/resize, manual refresh and foreground events. Investigate timezone/date/locale/package-update/reboot behavior during the spike; add narrowly scoped native refresh receivers only where required. Do not add exact alarms or 30-second polling for midnight. A timestamped stale snapshot is preferable to promising a deadline Android may delay. Force-stop, Doze, standby, worker quotas and Samsung battery policies can defer work.
5. Initially the widget does not mutate records; adding/removing/resizing it must not change reminder IDs, completion, recurrence or notification schedules. Multiple widget instances must not multiply alarm requests.

Sources: [library refresh APIs](https://saleksovski.github.io/react-native-android-widget/docs/update-widget), [Android update constraints](https://developer.android.com/develop/ui/views/appwidgets/advanced). Android's periodic widget update interval has a 30-minute minimum; worker/broadcast execution is constrained and not an exact-time guarantee.

## Tap navigation

Prefer direct launch/URI actions for opening the app rather than a headless broadcast-to-activity trampoline. Plan an Android-only registered URI such as com.hotrodtymn.matrix://today and a small root Linking handler for cold/warm starts. Wait for app data load, consume once, validate routes/IDs, then open the existing Today Dashboard. No navigation-framework replacement. Optional reminder row links may open the existing editor after confirming the record still exists; otherwise open Today with a message. No write or automatic save on tap. Validate actual Android PendingIntent/launch behavior on the installed SDK/launcher, and do not bypass the lock screen. Source: [library click handling](https://saleksovski.github.io/react-native-android-widget/docs/handling-clicks).

## Stages and tests

A. Compatibility spike: exact dependency pin, clean prebuild/config/autolinking review, native compile, static widget, cold/warm taps. Stop on incompatibility before expanding scope.

B. Read-only widget: reuse selectors, build responsive primitives, show empty/error/stale state and limited rows; test snapshots, disabled/expired alarms, monthly/year boundaries, DST/timezone changes, completedThrough, priorities and list deletion. Unit-test no scheduling/persistence calls during rendering.

C. Refresh/navigation: tests for post-commit hooks, notification-action isolation, debounce/order, multiple instances, missing/deleted items and validated cold/warm URI routing. Simulate slow/error reads without clearing real data.

D. Validation: TypeScript, lint, full tests, Android JS export, config diff and alarm patch hash/postinstall verification. Real Gradle compilation is required; JS export is not native proof. Do not claim EAS/Samsung success until performed.

E. Samsung acceptance: widget picker/add/resize/remove/re-add, reboot/package update, force-stop recovery after reopening, offline use, light/dark/large fonts/TalkBack, small/large grid sizes, multiple instances, tap positions, privacy of visible titles, midnight/timezone/DST and stale timestamps. Test reminder edits/priority/list changes and notification completion/snooze with Matrix closed. Re-run alarm ringing/Flip to Silence/next repeat, notes, tasks, calendar, timer/stopwatch and data-restart regression checks. No battery exemption or killed-process timing guarantee.

## Preview APK deployment, later authorization only

Adding widget native code requires a new signed Android preview APK. It cannot be enabled through the existing runtime 1.5.0 OTA alone. During implementation, propose a new appVersion runtime (e.g. 1.6.0, subject to version review) before native release, retaining package com.hotrodtymn.matrix and existing signing. EAS remote versionCode must increase over the installed APK. Keep old-runtime OTAs separate and publish no widget-dependent JS to 1.5.0.

After separate approval and successful checks, use the existing preview profile for an Android APK, inspect its merged manifest/compiled widget components and alarm patch markers, and install as an update over Matrix. Do not uninstall, clear storage, downgrade or change package/signing. Open Matrix once, verify all persisted data, then add the widget through Samsung's picker. Old APKs keep their working application; only the new native APK can expose the widget. No build, runtime bump or deployment was initiated in this planning task.

## Compatibility spike results (2026-11-18)

### Baseline and exact changes

Active branch verified as feature/android-home-widget at 43126d0. Tracked files were clean at the start; PHASE3_ANDROID_WIDGET_PLAN.md was the existing untracked plan and was preserved. This is not a claim that the entire initial working tree was empty. Main/remote were not changed during the spike.

Installed with `npx expo install react-native-android-widget@0.26.0 --npm -- --save-exact`. package.json and package-lock.json pin exactly 0.26.0; npm added one JS package and did not upgrade Expo, React Native or React. Installed versions remain Expo 57.0.27, RN 0.86.3 and React 19.2.3. Postinstall reapplied the existing alarm scheduler patch and verified its four hashes. npm reported 19 audit findings (16 moderate, three high); no unrelated audit fixes were applied.

Minimal implementation only:

- app.json adds the candidate config plugin with one MatrixCompatibility provider: static text, 180x80dp minimum, 2x1 target, resize support, home_screen category and updatePeriodMillis 0. No widget configuration activity, image asset, click/deep-link action, data access or periodic work.
- index.ts invokes a platform-resolved registration function while retaining existing root-component and notification-task registration.
- src/widgets/registerWidget.android.ts registers the native widget task handler; src/widgets/registerWidget.ts is a non-Android no-op and does not import the native package.
- src/widgets/MatrixCompatibilityWidget.tsx renders only static text for its own add/update/resize events, ignoring deleted/click/other-provider events. It uses the library's prescribed use-no-memo directive to avoid React Compiler widget-renderer incompatibility.
- test/widgetCompatibility.test.cjs checks event routing, static rendering and Android/non-Android registration isolation using mocks. It is not a native test.

No App.tsx, data models/storage, notification handler, native alarm scheduling, Flip to Silence, alarm patch, postinstall verification, EAS profile or signing modifications. Version and appVersion runtime deliberately remain 1.5.0 as requested. Generated android/ios remain ignored and untracked. The full Today widget is not implemented. Changes remain uncommitted.

### Candidate native requirements inspected

The installed 0.26.0 package declares Expo >=54 peers and supports the New Architecture in source; the nearest tagged example targets Expo 58/RN 0.88, not Matrix's exact versions. New Architecture remains enabled. Android autolinking finds AndroidWidgetPackage/libraryName AndroidWidget and its generated JNI target. Gradle selects the newarch AndroidWidgetSpec and codegen through the React plugin; this still needs a real compile.

Installed native Gradle dependencies are React Native (resolved by the app's React Gradle plugin), androidx.concurrent:concurrent-futures 1.1.0, androidx.work:work-runtime 2.12.0 and androidsvg-aar 1.4. It declares an AGP 8.6.0 buildscript dependency; Matrix's installed RN catalog declares AGP 8.12.0. Candidate SDK fallback is min 24, target 36, compile 37; its code prefers root ext SDK values, and Matrix declares compile/target 36. A native build must resolve/validate these combinations and transitive AAR requirements; none were silently overridden.

Clean Expo generation succeeded on this host. Inspected generated provider Java class, provider XML, false-exported widget receiver and BIND_REMOTEVIEWS collection service. The library manifest also exposes an image ContentProvider for launcher images; its source enforces read-only bounded paths and randomized names. Full merged-manifest/launcher-image behavior remains a native/device acceptance item. No personal data is rendered in this static probe.

### Checks and native result

- TypeScript and Expo lint: passed.
- Tests: all 53 passed (51 existing plus two spike groups).
- Android JS export: passed (.expo/widget-spike-export, 719 modules). This proves bundle resolution only.
- Expo Android prebuild, config introspection and plain-JSON Android native autolinking: passed. Prebuild's automatic android/ios npm script changes were reverted; package scripts are unchanged.
- Alarm patch integrity: all four source hashes passed after installation and again after generation. Protected alarm/notification/native files have no Git diff.
- Programmatic config comparison: Android package/settings, iOS configuration, app version, runtime policy, update URL and project identity unchanged; only the new widget plugin was added.
- Expo Doctor: 20/21; same four existing patch-version recommendations for expo, notifications, task-manager and updates. No SDK upgrade.
- git diff --check: passed.
- Actual native attempt: `android/gradlew.bat -p android :app:assembleDebug --console=plain` stopped before compilation: JAVA_HOME unset and java.exe not found (exit 9009). No Java/Javac/Gradle executable or standard JDK installation was detected. D:/Android contains Platform Tools only, not an Android SDK platform/build-tools/NDK installation; Android SDK environment variables are unset. No JDK/SDK was installed by this task.

Result: native compatibility is UNKNOWN, not passed or disproved. No Java/C++/Kotlin compilation, APK assembly, widget rendering on Samsung or installed-device test succeeded. Do not proceed to full widget implementation on the assumption that Metro/type checks prove compatibility.

### Smallest safe remote validation, approval required

First native proof can be a single internal Android APK containing only this static placeholder. Reuse Matrix's existing keystore/package, locked versions, New Architecture and preview APK build type. No full UI, extra native alarm modifications or dependency downgrades are needed for that proof.

Do not build this spike on the shared preview update channel while retaining runtime 1.5.0: the currently published Phase 2 OTA lacks the widget handler and could replace the spike's embedded JS, creating a misleading test. For a separately authorized remote build, first review adding only this preview-derived profile (not added now):

```json
"widget-compat-spike": {
  "extends": "preview",
  "channel": "widget-compat-spike"
}
```

Then the proposed command is `npx eas-cli build --platform android --profile widget-compat-spike`. It inherits APK/internal distribution and remote versionCode auto-increment from preview; those effects require build approval. Leave this channel isolated with no existing 1.5.0 OTA mapping, and do not publish widget JS to shared preview. EAS may initialize its empty channel/branch during the approved build. App version/runtime can remain 1.5.0 for an isolated compile-only spike as requested; a real widget release must receive a reviewed native runtime separation before OTA/deployment.

Alternatively provision a local JDK plus the existing project's Android SDK/Gradle requirements and repeat assembleDebug; do not change the app's toolchain versions to hide incompatibility. If a real build fails, capture its first native error, module and resolved versions before selecting a patch/version change. A successful compile is the first gate; add/resize/remove and cold process rendering on Samsung is the next gate. No paid/remote build or profile change was initiated. A spike APK must not replace production or be treated as a release candidate; retain app data and never uninstall/clear storage to test it.

### GitHub redirect verification

A read-only request to https://api.github.com/repos/Hotrodtymn/Matrix-mobile followed the redirect and returned full_name Hotrodtymn/MatrixMobile, html_url https://github.com/Hotrodtymn/MatrixMobile and clone_url https://github.com/Hotrodtymn/MatrixMobile.git. A read-only ls-remote of that canonical Git URL returned main at 43126d0. origin still uses its original Matrix-mobile.git URL. No remote edit, repository rename, push or merge was performed. feature/ios-support remains at e315558 and isolated.

## One isolated EAS build authorized (2026-11-18)

The user approved exactly one internal Android compatibility build and no full widget implementation. Reviewed spike committed as ac98132 with message test: add Android widget compatibility spike. Added a widget-compat-spike build profile derived from preview, explicitly internal/APK, using preview environment and its own widget-compat-spike update channel. Existing development/preview/production profiles are unchanged.

The plugin/native dependency requires a new native APK; it does not require changing appVersion/runtime merely to compile this isolated probe. Keep version/runtime 1.5.0 for this test only, as previously requested. No widget-dependent OTA will be published. The new build uses an empty isolated channel; shared preview stays mapped to its existing Phase 2 branch/update. A later widget release needs a reviewed runtime boundary before shared-channel deployment. Remote Android versionCode auto-increment is inherited from preview and is separate from the unchanged appVersion/runtime; the actual build code will be reported by EAS.

Use the existing Android keystore with non-interactive frozen credentials. Stop on an unexpected payment requirement, credential change or destructive setup. Submit only one build, and do not install it automatically. Actual compilation status is reported after monitoring the EAS result.

## Submitted isolated build: result pending

- Spike commit: ac98132 (test: add Android widget compatibility spike).
- Profile/build source commit: 23d8bee (build: isolate Android widget compatibility test).
- Exactly one command submitted: npx eas-cli build --platform android --profile widget-compat-spike --non-interactive --freeze-credentials --no-wait.
- Build ID: 3b7150bb-5b1e-4150-abed-17d3111b657d.
- URL: https://expo.dev/accounts/hotrodtymn/projects/matrix/builds/3b7150bb-5b1e-4150-abed-17d3111b657d.
- EAS final observed status for this task: IN_QUEUE, priority NORMAL, no reported error. Extended polling did not reach compilation. The remote build remains submitted/running through its queue; it was not canceled or retried. No completion or background-notification promise is made.
- App version/runtime remain 1.5.0; inherited remote Android versionCode incremented 11 to 12. Package remains com.hotrodtymn.matrix.
- Existing default keystore Build Credentials Kb1qq3AZ-X was reused with frozen credentials. No payment requirement, credential reset or destructive prompt appeared; this is not a claim about the account's ultimate billing statement.
- Live routing confirmed widget-compat-spike -> widget-compat-spike, with zero published updates. Shared preview -> preview remains on the published Phase 2 update; ios-preview is separate. No OTA update was published.
- Existing automated results remain 53 passing tests, TypeScript/lint/export/config checks and alarm hashes passing. Existing Expo Doctor patch warnings remain; there are no native compiler warnings/errors to report because no worker/compiler has run yet.

Compatibility conclusion: UNKNOWN / blocked on the EAS queue. Do not treat successful upload, static validation or submission as native compilation success. Read this exact build's terminal result/logs next; do not start another build without approval. If it succeeds, first manually test the static widget's add/resize/remove and cold-process rendering on Samsung, with existing alarm/Flip to Silence regressions. Full widget implementation remains deferred. No APK installation, merge, push, runtime bump or production configuration change occurred.
