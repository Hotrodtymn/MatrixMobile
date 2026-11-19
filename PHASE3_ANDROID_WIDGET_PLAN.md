# Phase 3 plan: Android Home-Screen Widget

Current status: the functional Android Today widget is implemented and reviewed on feature/android-home-widget. The user reports 8/8 Samsung compatibility checks passed on static APK code 14. The functional version passes local checks (69 Node tests, TypeScript, lint, Android export, clean native generation and alarm patch verification) but has not been natively compiled or Samsung-tested. See the functional implementation and final review below. Earlier queued, static-only and uncommitted observations are retained as historical records.

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

## Latest existing-build status check (2026-11-18)

Read-only EAS lookup of build 3b7150bb-5b1e-4150-abed-17d3111b657d now reports IN_PROGRESS, superseding the earlier queued observation. Build source is 23d8bee5a29fd532135244da0162a328039b2b15, Android SDK 57, app 1.5.0 / versionCode 12. completedAt is null, no build error is reported and no APK artifact is available yet.

The build has started but has not reached a terminal result. Gradle success, widget native compatibility and final warnings/errors are not established by this status check. Full widget implementation remains gated on the finished native logs and later Samsung static-widget acceptance. No additional build was submitted, and no APK installation, source/version/alarm edit, merge, push or OTA publication occurred. This update changes this plan only.

Build URL: https://expo.dev/accounts/hotrodtymn/projects/matrix/builds/3b7150bb-5b1e-4150-abed-17d3111b657d.

## Final verified EAS native result (2026-11-18)

Build 3b7150bb-5b1e-4150-abed-17d3111b657d is FINISHED, completed at 2026-11-18T20:25:19.455Z. Source: 23d8bee5a29fd532135244da0162a328039b2b15. App 1.5.0 / Android code 12; SDK 57, isolated widget-compat-spike profile/channel. EAS reports no build error.

Native evidence was retrieved from the build's worker log, decoded from its Brotli content encoding, and inspected (not inferred from TypeScript/Metro):

- :react-native-android-widget:generateCodegenSchemaFromJavaScript and generateCodegenArtifactsFromSchema completed.
- :react-native-android-widget:compileReleaseJavaWithJavac and processReleaseManifest completed, along with widget resource/package/lint tasks.
- :react-native-alarm-scheduler:compileReleaseKotlin and compileReleaseJavaWithJavac completed.
- patch-package applied react-native-alarm-scheduler@1.0.1; both installation/postinstall runs logged all four Matrix flip-v2 native source hashes verified before compilation.
- :app:assembleRelease completed, followed by BUILD SUCCESSFUL in 7m 46s (677 actionable tasks, all executed).

Conclusion: react-native-android-widget 0.26.0 is confirmed build-compatible with this exact Expo 57.0.27 / RN 0.86.3 minimal static-widget configuration. This clears the native compilation blocker. It does not establish widget runtime rendering, launcher registration/placement, interaction, background refresh or Samsung functional compatibility.

Warnings reviewed: Java deprecated-API notes, including output adjacent to widget Java compilation; Expo Modules Core RawPropsParser/Kotlin deprecations and unchecked casts; AsyncStorage unchecked/deprecation notes; manifest tools:replace warnings for com.facebook.soloader.enabled and FileSystemFileProvider authorities with no other declaration to replace; deprecated Gradle features noted as incompatible with Gradle 10. There were no reported widget provider/registration errors or alarm patch failures. Expo Doctor remained 20/21 and its non-fatal failed check listed only the four known patch mismatches (expo 57.0.27/~57.0.33, notifications 57.0.22/~57.0.25, task-manager 57.0.21/~57.0.23, updates 57.0.25/~57.0.28). The native build succeeded without toolchain/dependency edits.

Build page: https://expo.dev/accounts/hotrodtymn/projects/matrix/builds/3b7150bb-5b1e-4150-abed-17d3111b657d

APK artifact: https://expo.dev/artifacts/eas/9csYSZE0my8dawA5f5amtpf9Rr0pg4uCF7U4F7HDy8I.apk

EAS exposes both buildUrl and applicationArchiveUrl for this APK; a read-only HTTP HEAD returned 200. The APK was not installed or executed. Full widget implementation should proceed after manual Samsung smoke tests of the static placeholder (picker/add/resize/remove and cold-process rendering) plus alarm/Flip to Silence regressions. Those remain the proposed next step, not claimed test results. No additional build, merge, push, OTA, version change or alarm modification was performed. This result update changes only this plan; local decoded logs are ignored under .expo.

## Samsung APK installation preflight and recovery plan (2026-11-18)

Offline artifact checks (no installation): downloaded the official widget code-12 APK and earlier preview code-11 APK to ignored .expo files. Parsed each compiled binary AndroidManifest.xml, not just app.json. Results:

| Check | Widget artifact | Previous preview artifact |
| --- | --- | --- |
| Build | 3b7150bb-5b1e-4150-abed-17d3111b657d | 7ed4d685-2633-4307-affe-f6db668ee481 |
| Package | com.hotrodtymn.matrix | com.hotrodtymn.matrix |
| versionName | 1.5.0 | 1.5.0 |
| versionCode | 12 | 11 |
| Embedded OTA channel header | widget-compat-spike | preview |
| Signing certificate | Same SHA-256 below | Same SHA-256 below |

Signer certificate SHA-256:

`3e4563ba8edbd0d1ed99e89eebc68d1deb45cced004ecd574e5c40b11792a7ae`

The APK v2 RSA/SHA-256 signatures, certificate/public-key binding and chunked APK content digests validated for both artifacts using local Node crypto checks following the Android v2 format. This was a focused offline verifier, not Android Package Installer or the official apksigner tool (not installed here). Both APKs expose the same verified signing identity; EAS build evidence also shows the existing default credential label Build Credentials Kb1qq3AZ-X was reused with no reset for code 12. No private key/keystore was retrieved.

Widget APK SHA-256: `23627d4f19f00d8b36acbcdacd4673f345815bd29ee2f4caa40f4db155fdb728`.
Preview APK SHA-256: `af9638fd89cd9a29b22a81db9bfd2254cd65cb2cd16e098648c8b5c9e8c8bb8f`.

Both downloaded APKs passed scripts/inspect-flip-apk.py --require-v2: all four compiled native alarm/flip classes and every flip-v2 diagnostic marker were present. The actual APK manifests include MY_PACKAGE_REPLACED; existing AlarmSchedulerBootReceiver source handles it through rescheduleAll. Native alarm patch, bridge and notification task are unchanged between the old preview source and spike source.

### What remains unverified

The actual installed Samsung APK has not been read. Its versionCode and signing certificate are unknown. The verified code 11 is the earlier official preview artifact, not independent proof of what is on the phone. The reported successful OTA establishes that the application worked, not an exact installed APK identity. VersionName 1.5.0 alone cannot distinguish codes 11 and 12. No live schedule, permission, installed storage or physical widget test was performed.

If the phone currently has that official code-11 preview, code 12 is a compatible signed in-place update and is expected to preserve app-private AsyncStorage, native alarm preferences/records, notes, tasks, lists and settings. This is an expectation for an accepted update, not a data-loss guarantee or a verified backup. Existing storage keys and migration behavior are unchanged by the static spike. The package/channel do not create a second side-by-side Matrix installation.

Persistent records and live OS schedules are separate. Package replacement can stop the app/ringing service and invokes existing scheduling recovery. Matrix's alarm and Expo notification receivers handle package replacement, but Samsung timing, exact-alarm/full-screen/notification permissions and imminent delivery have not been tested for this update. Do not update during an active ring or near an important alarm; verify delivery afterward. Use Samsung Clock as an independent backup during critical tests. Screenshots/manual notes are not a complete restorable backup; no verified in-app full export/restore workflow is available here.

### OTA behavior

The compiled widget APK requests widget-compat-spike, verified again to map to its own branch with no published updates. It will not request future shared-preview OTAs while that mapping remains unchanged. Runtime remains 1.5.0, but channel routing still matters. Cached/embedded update selection and actual first launch have not been observed on the phone. Do not clear app data/update storage to force selection. The embedded widget build is newer than the currently published Phase 2 preview update; first-launch behavior should still be checked on Samsung. Returning to the normal preview channel requires a later approved APK or an explicitly approved routing/change strategy, not a Settings toggle implemented in Matrix.

### Safe manual installation, conditional on the checks above

1. Identify the existing installation from its known EAS download/build link or Samsung Settings > Apps > Matrix version/build information if shown. If only 1.5.0 is shown, record the build code as unknown. Do not infer code 11. If the current code is above 12, do not attempt a downgrade.
2. Before testing, record important reminders/alarms and settings; choose a quiet update window. Decide on the forward-recovery limitation below before replacing a working critical alarm app. If guaranteed immediate native rollback is required, defer installation until a recovery APK is prepared and verified.
3. Download the exact code-12 artifact from the build page in the phone's browser/My Files. If needed, permit APK installation only for that trusted source. If device policy blocks it, stop and report the message; do not broadly bypass managed-device protections.
4. The installer must recognize an update to the existing Matrix. If it instead proposes a separate app, reports signature conflict, downgrade or installation failure, stop. Never uninstall Matrix, clear storage/data or use a downgrade workaround. Android Package Installer remains the authoritative installed-signature/version check.
5. After a successful update, open Matrix once, confirm all stored data and permissions, then test a disposable near-future alarm, Flip to Silence and its next repeat. Check reminder notification actions/snooze as a regression. Only then add the static Matrix Compatibility widget via Samsung's widget picker and test resize/remove/cold-process rendering. No full Today widget is expected in this APK.

### Non-destructive rollback/recovery

The old code-11 APK is NOT an immediate rollback from code 12: Android normally rejects a lower version code. Do not uninstall to make it install. Removing only the widget from the launcher is safe containment and does not remove Matrix/data, but does not revert native code or restore the preview channel.

A real no-ADB/no-data-clear native recovery requires a future same-signed stable APK with a versionCode higher than 12 (and higher than whatever is actually installed), retaining package/storage keys and restoring the normal preview channel. Such an APK has not been built or authorized by this task. It would be installed using the normal Update flow. A separately approved known-good JS update on the isolated channel could address JS-only problems, but cannot remove native widget code or repair a native crash; no update was published here.

Decision: downloaded artifacts pass package/version/signing preflight. Installation is conditionally reasonable for the known official code-11 preview, but actual Samsung identity and a ready native recovery artifact remain unverified. If that recovery prerequisite is important, wait rather than assuming the old APK is a safe rollback. No installation recommendation is unconditional.

Official references: https://developer.android.com/google/play/app-updates (accepted update identity/version rules); https://developer.android.com/studio/publish/versioning (downgrade protection); https://source.android.com/docs/security/features/apksigning/v2 (signature format); https://docs.expo.dev/eas-update/how-it-works/ (channel/runtime matching).

## Samsung widget-picker investigation and corrected APK identity (2026-11-18)

### User-reported device results and clarification

The initial report said the code-12 widget compatibility APK had been installed, Matrix opened and existing functionality appeared to work, Matrix was absent from Samsung's widget picker, and restarting did not resolve it. During this investigation the user explicitly clarified that the code-13 recovery APK was installed when the picker was last checked. Do not treat the current absence as a demonstrated code-12 registration failure: code 13 intentionally has no widget. No additional physical testing is claimed. Android/One UI versions and profile type were not supplied.

### Branch and preservation

Active branch remains feature/android-home-widget at a917256. The pre-existing uncommitted plan was preserved byte-for-byte as the prefix of this document; its initial SHA-256 was B236F507D3CB5EF15659ED1DF94D5967283145E3BDE0AF2BED2B2B0F8D421323. An ignored copy is retained at .expo/phase3-plan-before-picker-investigation.md. Only this investigation section was appended. No app, package, version, alarm, notification or signing changes were made.

### Exact code-12 APK evidence

Inspected the previously downloaded artifact for build 3b7150bb-5b1e-4150-abed-17d3111b657d (APK SHA-256 23627d4f19f00d8b36acbcdacd4673f345815bd29ee2f4caa40f4db155fdb728). Direct AXML/ARSC/DEX inspection shows:

- Receiver com.hotrodtymn.matrix.widget.MatrixCompatibility is present, label Matrix Compatibility, exported=false. Neither application nor receiver declares enabled=false, so both are enabled by manifest default; current device component overrides cannot be checked from an APK.
- Its intent filter contains android.appwidget.action.APPWIDGET_UPDATE and com.hotrodtymn.matrix.WIDGET_CLICK.
- Its android.appwidget.provider metadata uses resource 0x7f130006, resolving to xml/widgetprovider_matrixcompatibility, physically stored as res/3d.xml (resource optimization renamed the file; the resource is not missing).
- That compiled XML is a valid appwidget-provider with minWidth=180dp, minHeight=80dp, targetCellWidth=2, targetCellHeight=1, resizeMode=3 (horizontal|vertical), widgetCategory=1 (home_screen), updatePeriodMillis=0, description=@0x7f100101, initialLayout=@0x7f0b0071.
- Description resolves to Static native compilation spike; no reminder data. Initial layout resolves to layout/rn_widget with valid default/night XML variants res/iO.xml and res/wI.xml. No configuration activity is requested. No previewImage is provided; it is optional in the installed 0.26.0 type definition, not an established cause of absence.
- DEX contains Lcom/hotrodtymn/matrix/widget/MatrixCompatibility; as well as the widget engine. Manifest merging did not remove/disable this provider or its metadata.

### Source and maintainer requirements

Installed package is react-native-android-widget 0.26.0. Its app.plugin.js and src/config-plugin.type.ts were inspected directly, rather than assuming current website docs describe a different version. app.json uses the documented plugin tuple and widgets array; MatrixCompatibility matches the provider and JS widgetInfo name. Package main points to index.ts, which calls registerRootComponent followed by the Android-specific registerWidgetTaskHandler wrapper. The exported handler renders only its own WIDGET_ADDED, WIDGET_UPDATE and WIDGET_RESIZED events. The other-platform entry is intentionally inert. This matches the maintainer's Expo registration and handler instructions.

The library itself emits exported=false for the receiver; this is not evidence of a merge error and was not changed speculatively. No missing Samsung-specific metadata or generic Android registration defect has been established. Picker discovery is native registration; the JS handler is relevant once the widget is added/rendered, not a substitute for native provider metadata.

References:
- https://saleksovski.github.io/react-native-android-widget/docs/tutorial/register-widget-expo
- https://saleksovski.github.io/react-native-android-widget/docs/tutorial/register-task-handler
- https://saleksovski.github.io/react-native-android-widget/docs/public-api/interfaces/Widget
- https://developer.android.com/develop/ui/views/appwidgets

### Root cause and targeted next step

The established explanation for the current picker result is that the installed code-13 recovery APK deliberately excludes widgets. Re-inspection of the downloaded recovery APK confirms no MatrixCompatibility receiver/class, no widget provider resource and no widget manifest entries. No registration code fix is warranted on this evidence. A genuine picker failure while code 12 was actively installed remains unverified; the earlier report alone must not be presented as reproduced or resolved code-12 behavior.

Do not reinstall code 12 over code 13: that is a downgrade, and uninstalling/clearing data is prohibited. Any subsequent widget test needs a separately authorized same-signed widget APK with a versionCode higher than the installed code 13. For a recoverable test, also prepare/verify a stable recovery APK with a code higher than that future widget build: existing recovery code 13 cannot normally replace a future code 14. No such build, version change or installation is authorized or performed here. Static picker/add/render verification must precede full widget implementation. If a future known widget APK is absent, record its exact build identity, Android/One UI version/profile and native provider/device state before changing configuration.

### Proposed automated guard and current validation

Propose a tracked APK-level guard (not added to application code in this investigation): require the expected package/version/channel/runtime; enabled-by-default-or-explicit receiver; APPWIDGET_UPDATE action; resource-valued android.appwidget.provider metadata; a resolvable appwidget-provider root; positive dimensions/home-screen category; valid initial layout and label; compiled provider class; and absence of a configuration activity unless configured. Match names against app.json. Run a negative control on the stable recovery APK, where widget absence is expected, and include APK SHA/build identity in Samsung instructions. JS tests alone cannot establish picker registration. Do not require exported=true or a preview bitmap without a platform-specific reason.

The ignored .expo/inspect-widget-registration.py diagnostic performs compiled AXML/ARSC/DEX inspection for this investigation; it does not install or modify APKs and is not yet a tracked regression test. Local TypeScript, lint, all 53 tests and all four native alarm-patch hash checks passed. Existing widget tests cover handler event/name filtering and platform-specific registration. No new native compilation or physical-device verification was performed. No APK build, OTA, merge, push, data clearing or full widget implementation occurred.

## Controlled code-14 widget / code-15 recovery pair

The user confirms stable recovery code 13 is currently installed and authorizes at most one new widget build and one stable recovery build. No application/native widget registration fix is being introduced: the current absence is expected for code 13. Existing uncommitted plan content is preserved; SHA-256 before this section: 35922F4787A96EB6242C844C524BE54EFD3BC12D4F00B95D428AE0996769A12E. Ignored exact backup: .expo/phase3-plan-before-code14-15.md.

Preflight: EAS Android remote counter 13; recent builds terminal, no competing active build observed. Both profiles use remote autoIncrement. Submit widget first, require assigned 14, then read back counter 14 before submitting recovery for 15. Stop on any conflicting assignment, unexpected payment or credential change; never reset the counter. Package stays com.hotrodtymn.matrix, version/runtime 1.5.0, existing default remote signer, --freeze-credentials. Channel widget-compat-spike maps only to its own empty branch; preview maps to preview with approved Phase 2 runtime-1.5.0 update. Production profiles/routing are unchanged. The shared appVersion runtime is retained for these same-code rebuilds; no widget OTA is published or considered interchangeable with stable native builds.

Added scripts/check-widget-apk.py and test/widget-apk-checks.test.cjs plus ten Python regression cases in test/widget_apk_checks_test.py. The checker decodes actual binary manifest/resources and DEX definitions, validates package/code/runtime/channel and expected provider label/dimensions/action/metadata/layout/class, or rejects any widget registration/native engine in recovery. It accepts the library's valid non-exported receiver. Positive controls pass on the downloaded widget code 12 and widget-free recovery code 13. Python is required for the new Node test wrapper (PYTHON can override its executable); no app dependency was installed.

Before submission, widget checks passed: TypeScript, lint, 54 Node tests (including the ten-case Python guard suite), Android export, resolved EAS config and all four alarm-patch source hashes. Stable recovery checks passed: TypeScript, lint, 52 Node tests (same Python guard suite), Android export, config and patch hashes. App code, widget configuration, dependencies, assets and native alarm logic are unchanged from the previously compiled widget spike. The isolated recovery/android-code15 branch starts directly at main 43126d0; only its APK profile, build-time checker/tests and report differ from stable main. Its code-13 recovery worktree is reused without changing locked dependencies. The prior recovery report was preserved on recovery/android-code13 at 84272de.

Final APK checks and build IDs: pending submission/completion. Do not install the widget until BOTH artifacts are finished and verified, including certificate equality and compiled Flip to Silence markers. No physical-device result is claimed for these new APKs. Test only the static picker/add/render/resize/remove flow, then alarm/reminder/Flip to Silence regressions; capture exact installed build identity before interpreting picker results. Code 15 is the intended update recovery from code 14. Do not uninstall, clear app data, install old code 12 over 13, or rely on code 13 to replace code 14.

### Authorized pair submission

Widget build ID 8bc1d854-34bd-4885-bc23-5f802ab94e02:
https://expo.dev/accounts/hotrodtymn/projects/matrix/builds/8bc1d854-34bd-4885-bc23-5f802ab94e02
EAS assigned code 14, package com.hotrodtymn.matrix, runtime 1.5.0, channel widget-compat-spike, source 9a88a785d7902fa0220193bac818ad4f48410e4d. Initial status IN_QUEUE.

Recovery build ID 133fc439-1ca0-49c5-936b-fe284b5480f6:
https://expo.dev/accounts/hotrodtymn/projects/matrix/builds/133fc439-1ca0-49c5-936b-fe284b5480f6
EAS assigned code 15, same package/runtime, channel preview, source 4f476912b0547fd1c648fd8c14f61b550a52c111. Initial status IN_QUEUE. Both reused existing default keystore Kb1qq3AZ-X under frozen credentials. Remote counter advanced 13 -> 14 -> 15 with no reset, credential change or payment prompt. Exactly one build of each was submitted. Compilation/APK verification remains pending until these specific builds finish; no replacement build is authorized.

### Final paired APK results — verified and ready for controlled testing

Both builds are FINISHED. Exactly one widget and one recovery build were submitted; no retries or additional builds were needed. All inspections below used downloaded APKs, not only source configuration or Metro output.

| Artifact | Widget compatibility | Stable recovery |
| --- | --- | --- |
| Build ID | 8bc1d854-34bd-4885-bc23-5f802ab94e02 | 133fc439-1ca0-49c5-936b-fe284b5480f6 |
| VersionCode | 14 | 15 |
| Package | com.hotrodtymn.matrix | com.hotrodtymn.matrix |
| Version/runtime | 1.5.0 / 1.5.0 | 1.5.0 / 1.5.0 |
| Channel | widget-compat-spike | preview |
| Gradle result | BUILD SUCCESSFUL in 7m 32s | BUILD SUCCESSFUL in 6m 25s |
| Native widget compilation | Present, successful | Absent |
| APK registration guard | MatrixCompatibility provider present, passed | No widget registration/resources/classes, passed |

Widget APK: https://expo.dev/artifacts/eas/QIs8ws_NTzZkJW3gUpeUsL_b3NVeIoIvqhvjDehuKRE.apk
Recovery APK: https://expo.dev/artifacts/eas/pei0M3nN2w19HGmELWfJvefNZRgVGQPIaHiZohWIrJc.apk

Widget SHA-256: a02b3e0f89c0edde04b9da200f3369150421e5c7eb4259c547af6e2396f9b6a3.
Recovery SHA-256: 405dcc1c3029eeb37cb7f5b837378bb3181da552f163f2b43aef838d5c58f2d4.
Both APK v2 signatures and signed content digests validate. Both signing certificates were explicitly compared and match the existing code-12/code-13 certificate SHA-256: 3e4563ba8edbd0d1ed99e89eebc68d1deb45cced004ecd574e5c40b11792a7ae. This is offline artifact verification, not Android apksigner or a read of the installed phone certificate.

The code-14 manifest has enabled-by-default com.hotrodtymn.matrix.widget.MatrixCompatibility, label Matrix Compatibility, exported=false as generated by the library, APPWIDGET_UPDATE action and android.appwidget.provider metadata. Its reference resolves to valid XML, home_screen category, 180x80dp / 2x1-cell dimensions, valid initial layouts and description. The compiled provider/engine classes are present. Code 15 has no widget provider, metadata, XML or engine classes. Actual manifest/resource checks confirm both package/version identities, runtime 1.5.0 and their distinct Expo update channel headers.

Both native logs show alarm scheduler Kotlin/Java compilation, two all-four-source-hash patch verifications and no native/alarm patch failure. Both APKs contain all four expected compiled alarm/Flip to Silence classes and all flip-v2 diagnostic markers. Existing nonblocking warnings remain: Expo Doctor 20/21 with the same four patch-version advisories, native deprecation/unchecked-operation messages, redundant manifest replacement notices and Gradle 10 deprecation warnings. No dependency upgrade, credential change, unexpected payment prompt or production configuration change occurred.

Re-run artifact guards with Python:

```powershell
python scripts/check-widget-apk.py .expo/widget-code14.apk --expect-widget present --version-code 14 --channel widget-compat-spike
python scripts/check-widget-apk.py D:\Projects\Matrix-recovery-code13\.expo\recovery-code15.apk --expect-widget absent --version-code 15 --channel preview
```

Detailed JSON checks, downloaded APKs, build metadata and decoded Gradle logs are under ignored .expo/widget-code14* and the recovery worktree's .expo/recovery-code15* paths. Source/tooling commits: widget 9a88a78, recovery 4f47691. The plan and final recovery report remain uncommitted; original plan bytes were preserved. Main remains 43126d0 and iOS branch e315558 remains isolated.

### Controlled Samsung acceptance sequence (manual, not performed)

1. Download and retain BOTH exact APKs before testing. Record important schedules and choose a quiet period without an active/imminent important alarm. Current user-reported installed code is 13.
2. Install only widget code 14 as an in-place Update. Stop on signature/downgrade/uninstall prompts; do not clear data. Open Matrix and verify reminders, lists/priorities, Today, alarms and permissions remain intact.
3. While code 14 is still installed, open Samsung's Widgets picker and search/browse Matrix and Matrix Compatibility. Record Android/One UI version and profile type. Capture exact build identity and a screenshot if it is absent; do not interpret results after recovery code 15 as a widget failure.
4. Add the 2x1 static placeholder and confirm Matrix compatibility test renders. Check resize/remove and reopen Matrix. Do not proceed to the full widget until picker/add/render succeeds. Test a disposable alarm (including Flip to Silence, snooze/dismiss) and reminder; no existing schedule should be deleted or changed by the widget.
5. If recovery is needed, install stable code 15 as an Update, never uninstall/clear data. Reopen Matrix, verify data/permissions and re-test alarm/reminder behavior. Preview OTA delivery resumes and widget disappearance is expected. Code 13 is not a rollback for code 14; code 15 is the prepared higher-code recovery.

The same package/signer and increasing codes support non-destructive updates, but installation acceptance, app-data preservation and live alarm rescheduling still require Samsung observation. No app was installed, uninstalled, force-stopped or cleared, and no merge, push, OTA or full widget implementation occurred. There are no unresolved build/artifact blockers for this controlled test; physical-device widget discovery remains unverified.

## Functional Android Today widget implementation — not deployed

### Verified compatibility baseline supplied by the user

The user reports 8/8 Samsung compatibility checks passed on widget APK versionCode 14: discovery, rendering, resizing, removal, app closure and phone restart passed; existing reminders, alarms and Flip to Silence remained functional. This records exactly the supplied summary, without inventing a mapping of individual assertions to eight numbered cases. It is user-reported acceptance of the static compatibility APK, not independent agent testing or verification of the functional Today implementation below. Prior discovery uncertainty is superseded for the code-14 placeholder only.

Active branch at implementation start and completion: feature/android-home-widget, HEAD 9a88a78. The only pre-existing change was this uncommitted plan. Its complete prior bytes are preserved as this document's prefix; SHA-256 before this implementation was 0A777D4B8189AED178E8D0318382D6620DE4DA14ADA2CF84733083D33039B5EF. Ignored backup: .expo/phase3-plan-before-functional-today.md. No reset, branch overwrite or merge occurred. Main remains 43126d0 and feature/ios-support remains e315558.

### Implemented behavior and design decisions

- Replaced static text with Today date, upcoming incomplete reminder occurrences with local scheduled/effective snooze times, HIGH/MED/LOW text-and-color indicators, next calculable enabled alarm, and snapshot update time. Chronological order, priority tie-break then stable ID; missing/unknown priority defaults to none. Overdue reminders are intentionally not in the widget's upcoming-only list; Today Dashboard still shows its existing overdue section.
- Reuses todayReminders, nextAlarm, recurrence predicates/completion-through handling and priority helpers; no new recurrence or alarm scheduling algorithm. Monthly clamping, weekly/selected-day/daily/legacy once handling and DST alarm uncertainty remain inherited. Unknown enabled alarm times are flagged; a known candidate is labeled Known alarm rather than falsely asserted to be the earliest of all enabled alarms. The widget is a computed display, not proof Android will deliver an alarm.
- Retains provider/component name MatrixCompatibility and its exact Java package, 180x80dp minimum, 2x1 target, resizing/category and engine 0.26.0. Public picker label becomes Matrix Today. Compact layout shows one row; taller widgets show up to five, with +N more. Long text truncates, tap opens the full dashboard. Android light/dark representations are supplied; the widget follows launcher/system appearance, while Matrix's own theme behavior is unchanged. Large font scaling may require resizing.
- Added a reusable readReminderAlarmSnapshot from existing validated dashboard reads. Today Dashboard still receives the same reminders/alarms/tasks result; the widget reads only the existing reminder/alarm keys and does not need valid task data. No new persistence key, migration, native database reader, write, schedule or permission request. Legacy optional fields remain supported; malformed records/JSON or ambiguous completion/snooze metadata produce a visible Cannot load Today state without rewriting data. Reads time out after four seconds. Empty upcoming content explicitly says no more reminders today / no upcoming alarm.
- Entire widget opens matrix-today://dashboard/today using the library's native OPEN_URI action. Android-only VIEW/BROWSABLE/DEFAULT data filter is generated; MainActivity remains singleTask. Linking initial URL opens the existing Today modal on cold launch, live events open it while warm, nonmatching URLs are ignored and deferred startup work is canceled on unmount. Existing screens/editors close without saving as part of this explicit widget navigation. No row controls or IDs/content are placed in the URL. No Home voice control is introduced.
- Successful serialized reminder mutations (UI edits, metadata/list changes and existing notification action persistence) emit a read-only observer; failed mutations keep their original rejection and do not emit success. Alarm saves emit after successful existing storage writes. Observers cannot throw into persistence, scheduling or notification results. No notification action algorithm, receipts, cancellation or scheduling code was changed; the reminder module diff is the observer import and one independent promise-success observer only. Unrelated catalog mutations may coalesce into a refresh, but no-widget requests perform only a native installed-widget lookup and skip storage/rendering.
- Android entry registration is idempotent. Add/update/resize tasks read fresh persisted data headlessly without mounting App or initializing alarms; deleted/click/other-provider tasks do not read/render. Foreground events and successful saves request coalesced refreshes; writes during an in-flight update cause one fresh pass afterward. Lifecycle and persistence renders share a JS queue so older reads cannot submit after later ones. Failures recover without breaking saves. Refreshes use the awaited by-ID API, avoiding the installed 0.26.0 all-widget API's unawaited async forEach. Native image/worker execution order and launcher delivery remain platform behavior, not a guarantee made by this JS queue.
- Provider updatePeriodMillis is 1800000 (30 minutes) as a best-effort OS fallback. No JS polling interval, exact alarm, boot service, foreground service, microphone or battery-optimization bypass was added. Headless startup avoids an extra foreground refresh; no widget means no data read. Multiple widgets share a single fresh read per persistence refresh and use independent sizes.

### Exact changed files

| File | Purpose |
| --- | --- |
| App.tsx | Android Today link subscription; post-persistence alarm refresh signal |
| app.json | Android-only link filter, Today picker text and 30-minute provider metadata |
| src/services/dashboardSnapshot.ts | Shared validated read-only reminder/alarm snapshot, retained dashboard API |
| src/services/reminders.ts | Independent success observer on existing mutation queue; no action/schedule changes |
| src/services/widgetDataEvents.ts | Exception-isolated observers and refresh coalescing |
| src/services/todayWidgetNavigation.ts | Exact URL contract, cold/warm subscription and cleanup |
| src/widgets/MatrixCompatibilityWidget.tsx | Functional compact/resizable Today representations and lifecycle handler |
| src/widgets/registerWidget.android.ts | Headless registration, foreground/save refreshes, awaited by-ID updates |
| src/widgets/todayWidgetModel.ts | Shared-selector upcoming data and priority/alarm formatting |
| src/widgets/loadTodayWidget.ts | Bounded persisted reads and privacy-safe error fallback |
| src/widgets/widgetRenderQueue.ts | Serialized JS draw submissions and failure recovery |
| scripts/check-widget-apk.py | Optional --functional-today mode requiring Today label, periodic metadata and native link filter; old static/recovery modes retained |
| test/reminders.test.cjs | Actual observer harness; persisted notification-state/failure-isolation regression |
| test/widgetCompatibility.test.cjs | Data/recurrence/legacy/malformed/empty/priority/headless/real-renderer tests |
| test/widgetRefreshNavigation.test.cjs | Refresh/coalescing/recovery, cold/warm links, alarm-write ordering and config tests |
| test/widget_apk_checks_test.py | Functional native metadata/deep-link guard regression |
| PHASE3_ANDROID_WIDGET_PLAN.md | Preserved history, supplied Samsung result and this implementation report |

No dependency/lockfile, EAS profile, signing, package ID, app version/runtime, native alarm scheduling, notification task, Flip to Silence native bridge, patch or postinstall verifier changes. App changes are additive navigation/observer hooks; existing UI symbols and legacy notification text were verified preserved. No iOS-only work or voice modules were brought in. All implementation changes remain uncommitted and unstaged.

### Validation results

- TypeScript: passed.
- Expo lint: passed without warnings after removing UTF-8 BOMs from new files.
- Node tests: 66/66 passed, including 11 Python APK guard cases invoked by the Node suite. Existing reminder/notification/snooze/recurrence/list/task/Today/Flip to Silence regressions remain green.
- New integration coverage checks success observers after stored notification actions, failures not changing results, no refresh for failed alarm writes, concurrent refresh coalescing and recovery, cold-start/warm URL routing and cancellation, local midnight/recurring completion, malformed/missing data and bounded read failures. Actual installed 0.26.0 buildWidgetTree converts ready/empty/error layouts in both themes successfully; unsupported React Fragments were avoided. Mock tests alone are not treated as renderer compatibility evidence.
- Android Hermes export: passed, 724 modules, .expo/functional-today-export. Only environment NO_COLOR/FORCE_COLOR warnings were emitted by Metro.
- Clean native generation: passed in isolated .expo/functional-today-native-check with --platform android --no-install; no APK compiled. XML assertions confirm original provider class/name and dimensions, label Matrix Today, APPWIDGET_UPDATE/provider reference, 1800000ms period/home_screen category, Today URL filter, singleTask activity and no RECORD_AUDIO permission. Both generated native directories remain ignored/untracked.
- Existing root android directory was not deleted/overwritten. Initial introspection of that old generated project retained the old label because this library's plugin skips an already-present receiver. Fresh isolated generation proves the current config emits the correct label/filter/XML. A future approved EAS build must use clean CNG input (android remains Git-ignored; no .easignore overrides), and its final APK must pass --functional-today rather than relying on stale local introspection.
- APK guard backward controls: actual code-14 static APK still passes original mode; code-15 stable recovery still passes widget-absent mode. A future functional APK must use --expect-widget present --functional-today with its actual assigned code/channel/runtime. Existing static artifacts do not validate this new functional native setup.
- Alarm patch: all four installed native source hashes verified; patch, hashes and postinstall verification unchanged. No new native alarm compilation or Samsung verification is claimed. Java/javac/Gradle were not found on PATH; no local native compilation was attempted.
- Expo Doctor: existing 20/21, failure only for four baseline patch-version advisories: expo 57.0.27 vs ~57.0.33; notifications 57.0.22 vs ~57.0.25; task-manager 57.0.21 vs ~57.0.23; updates 57.0.25 vs ~57.0.28. No dependency fixes/upgrade were applied.
- git diff --check passed; protected native/notification/config/dependency files were compared with HEAD. No EAS build/update, merge, push or installation occurred.

### Samsung-only acceptance and limitations

This functional implementation is not device-verified. The prior 8/8 result applies only to the compatibility placeholder. Refresh is best effort: Android update broadcasts, WorkManager/headless execution, Doze, launcher caching and Samsung background policies can delay or skip updates. A notification action may finish its headless session before an independent refresh completes; periodic/foreground/lifecycle refresh is the fallback. The widget shows its snapshot date/update time, not a live clock. There is no exact midnight/timezone-change receiver or guarantee of immediate removal when a reminder's time passes. Device timezone/locale, DST uncertainty, font scaling and TalkBack require testing. Widget appearance follows system/launcher mode rather than Matrix's app-specific theme override.

After a separately authorized isolated native APK is prepared and verified:

1. Retain a usable higher-code stable recovery APK before installing. Open Matrix once after its in-place update; confirm saved data, list/priority metadata and permissions. Never uninstall or clear data.
2. Confirm Matrix Today discovery and existing provider/instance retention, add/resize/remove, compact/large layouts, long titles, font scaling, light/dark and empty/error readability. Tap from warm app and closed process: the existing Today Dashboard must open, never a chooser or unrelated screen.
3. Test upcoming once/daily/weekly/selected-day/monthly reminders, completion-through, snooze, past/tomorrow exclusion, all priorities and legacy records. Compare times with Today and native alarm UI; disabled/expired/unknown/DST alarms must not receive invented next times.
4. Create/edit/delete/complete/snooze reminders through existing UI/actions and change list priority; check widget refresh only after persisted changes, across multiple instances. Toggle/edit/delete an alarm and verify next-alarm text. Changes must never create duplicate notification/alarm schedules.
5. Close Matrix without force-stopping it, wait for periodic refresh, restart phone, cross midnight and change time zone/locale; record actual delays and ensure fresh data on next lifecycle/foreground refresh. Force-stop and battery restrictions can prevent background work; do not bypass them.
6. Re-test alarm ringing, Flip to Silence, snooze/dismiss, reminder notification actions and recurrence delivery, plus notes/tasks/calendar/timer/stopwatch and persisted data. No extra physical acceptance is claimed now.

### Deployment gate and recovery preservation

Implementation and local checks are ready for review before a new isolated Android preview APK, not for OTA/deployment. The new Android filter and periodic metadata require a native APK; do not publish this JS to existing runtime-1.5.0 installations as a substitute. App version/runtime remain 1.5.0 by explicit instruction; no local or remote versionCode was changed. Review runtime separation, assign a higher Android code and approve the build separately.

The existing verified stable recovery code-15 APK is unchanged (SHA-256 405dcc1c3029eeb37cb7f5b837378bb3181da552f163f2b43aef838d5c58f2d4), with its branch/report and preview channel preserved. It remains an in-place recovery from code 14, but Android normally will not accept code 15 over a future widget APK with code >15. To retain non-destructive recovery for that future test, prepare a separately approved stable recovery with a still-higher code before installation. No recovery source/artifact or production channel was modified here. Do not deploy until instructed.

## Final functional-widget review for commit

Reviewed the complete functional change and all accumulated Phase 3 documentation on feature/android-home-widget. Historical native-build/APK/safety/discovery entries and the supplied code-14 Samsung 8/8 report are retained. The current-status paragraph now points to the functional implementation, rather than incorrectly saying the full widget is absent. Earlier statements that changes were uncommitted describe their historical observation; this reviewed work is being committed with message `feat: add functional Matrix Today widget`.

### Confirmed defects corrected during review

1. One-time reminders snoozed from an earlier date into today were omitted because original-date Today filtering excluded them. A focused regression reproduced the omission before the fix. Pending snoozes now consult the existing occurrence/completion selector on the source date, without changing the record or resurrecting completed/completion-through occurrences.
2. Applying a recurring reminder's snooze globally could hide an earlier regular occurrence, omit an earlier-day pending snooze, or hide today's regular occurrence when a snooze was tomorrow. A second failing regression reproduced the incorrect display time. The widget now treats regular recurring notifications and the pending snooze as separate read-only candidates and displays the earliest future time per reminder. The shared overdue selector, with snooze removed only in a temporary projection, identifies an uncleared source occurrence. A future source occurrence cannot invent an earlier snooze; completed sources remain excluded. No recurring backlog, extra rows for the same reminder, scheduling or stored state is created.

The pending-time refinement supersedes the initial implementation's simple effective-snooze ordering description. All other selection, priority formatting, read-only storage, headless lifecycle, queued/coalesced refresh and cold/warm Today navigation behavior remains as documented. The added snooze search runs only for future snoozes due in the local day, using the shared bounded recurrence search; no timer, extra exact alarm, native worker or background wake mechanism was introduced.

### Review evidence and scope

- Verified all pre-existing named scheduling/action/helper function bodies in App.tsx and reminders.ts are unchanged, except the explicitly reviewed saveAlarms observer and serializeReminderMutation observer. In particular, notification response handling, receipts, scheduling, cancellation and native alarm/silence behavior are not altered. The widget itself has no storage write/schedule/complete/snooze controls. Successful saves only notify independent, exception-isolated rendering observers.
- Confirmed package.json, package-lock.json, eas.json, alarm patch/hash/postinstall files, native alarm settings bridge and notification task are unchanged. App configuration differs only in Android Today intent filters and the widget label/description/period; provider identity/class/dimensions/category remain intact. Package ID, signing profiles, app version/runtime, storage keys and iOS fields remain unchanged. Main stays 43126d0; feature/ios-support stays e315558. Voice remains removed.
- Re-ran TypeScript and lint: passed. Full Node suite: 69/69 passed, including 11 Python APK-guard cases. New regressions cover overnight one-time snoozes, completion protection, earliest recurring pending times and no duplicate rows, plus local midnight on a DST-change day and UTC/half-hour offsets in America/New_York, Asia/Kolkata and Pacific/Auckland.
- Re-ran Android Hermes export: passed, 724 modules, .expo/functional-today-reviewed-export; only the environment NO_COLOR/FORCE_COLOR warning. Repeated clean native generation in .expo/functional-today-native-review and XML assertions: passed. Existing generated projects were not overwritten. This is configuration validation, not Gradle/APK compilation.
- Re-verified all four native alarm-patch source hashes: passed. Recovery code-15 artifact remains unchanged with SHA-256 405dcc1c3029eeb37cb7f5b837378bb3181da552f163f2b43aef838d5c58f2d4. No recovery branch/worktree content was edited. The pre-existing recovery report modification was left alone.
- No remaining blocking code defect was identified in this review. The functional version still requires native compilation/APK inspection and Samsung acceptance. Doze/launcher refresh delay, background-session termination, reboot/midnight/timezone behavior, typography/TalkBack, real cold-start navigation and reminder/alarm/Flip to Silence regressions remain physical-device checks. Prior 8/8 compatibility acceptance is not evidence these functional behaviors passed.

No APK build, EAS version assignment, runtime change, OTA publication, merge, push or installation was performed. A future approved native release still needs its version/runtime review and a usable higher-code stable recovery option before Samsung installation; existing code 15 is preserved but cannot normally replace a future APK with a higher code.

## Month-end handoff — EAS quota blocker and GitHub backup

The user requested that Matrix work be saved to GitHub and intends to resume when the monthly Android build allowance resets. Functional implementation commit: 944a0f55c183cadf5e35c589533b4cef3138493c; branch feature/android-home-widget. Local review validation passed: TypeScript, lint, 69 tests (including 11 Python APK-guard cases), Android export, clean native configuration generation and all four alarm-patch hashes. Functional native compilation/Samsung acceptance are still unverified; the reported 8/8 Samsung result applies only to static code 14.

The authorized code-16 widget submission could not start a native build: EAS exhausted this account's monthly Free-plan Android allowance and reported a reset on December 1, 2026. The CLI had already incremented the shared remote Android versionCode from 15 to 16, reused existing frozen signing credentials, uploaded the source and computed its fingerprint before rejecting submission. Read-only verification found no code-16 build ID/APK; the latest completed build remained stable recovery code 15. Code-17 recovery was not submitted. No billing change, plan upgrade, version-counter reset or retry was performed.

Resume carefully: fetch/check branch and remote state, then check EAS build quota, active/recent builds and the remote version counter before any build command. The counter was 16 at the last check, so blindly repeating the existing autoIncrement command would normally assign 17 rather than the requested widget 16. Review an explicit safe strategy for exact widget 16/recovery 17, accounting for any intervening builds; do not lower/reset the shared counter automatically. Verify the functional widget build and its APK/provider/signature before preparing the separate stable recovery from main 43126d0. Both use com.hotrodtymn.matrix, app/runtime 1.5.0, existing signer; widget uses widget-compat-spike and stable recovery uses preview. Do not change runtime/version or production routing without the release review/authorization already described above.

Existing code-15 recovery is intact but cannot normally replace a future higher-code widget installation. Retain a newly verified higher-code recovery before that future Samsung test. Preserve the existing recovery worktree's uncommitted ANDROID_RECOVERY_CODE15.md report. Main and feature/ios-support remain isolated and unchanged. No APK was installed, no app data was cleared, no OTA was published and no branch was merged. This handoff adds documentation only; no app/native/dependency changes or repeated tests were needed.
