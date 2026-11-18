# Today Dashboard Phase 1

## Baseline and scope

Branch: feature/today-dashboard, created directly from 8699bd5 (voice-free Matrix 1.5.0 / Android build 11). Initial working tree was clean. feature/ios-support remains at e315558; no iOS changes were merged or copied.

Baseline qualification: the user reported that a restored voice-free APK worked, but did not identify build 11 or explicitly verify Flip to Silence. This baseline is authorized for development, not independently Samsung-verified by build number. No physical-device verification is claimed here.

## Files changed

- App.tsx: Home/menu entries, dashboard modal and row navigation. Extract existing reminder editor setup into openEditReminder so both entry points use the same behavior. Existing alarm editor reused; task rows open the existing Tasks screen.
- src/screens/TodayDashboard.tsx: read-only, theme-aware safe-area screen; summary, today/overdue reminders, upcoming alarms and due/overdue tasks; loading, error/retry and empty states.
- src/services/todayDashboard.ts: pure display selectors for reminder occurrences, overdue status, next alarm and task due dates.
- src/services/dashboardSnapshot.ts: read-only snapshot from existing reminder/alarm keys and taskStore.list; malformed records/duplicate IDs report an error without rewriting storage.
- test/dashboardHarness.cjs and test/todayDashboard.test.cjs: mocked read-only storage and selector regressions.
- TODAY_DASHBOARD_PHASE1.md: this report.

No dependencies, storage keys, app/native configuration, permissions, signing or package/version changes. No scheduler, notification action, alarm patch, Flip to Silence or recurrence-definition changes. Voice stays removed. No merge, EAS build, OTA publication or commit initiated.

## Behavior and decisions

- Summary counts: incomplete reminder occurrences today, next calculable occurrence per enabled upcoming alarm, and overdue incomplete reminders (one latest uncleared occurrence per record).
- Existing reminderOccursOnDate/getReminderOccurrenceDate/getRecurrence helpers determine daily/weekly/monthly/yearly/selected-day occurrences. Original start time, completed flags and completedThrough are respected. Snooze delays overdue highlighting until its stored deadline; it does not rewrite recurrence or schedule another request. Today's occurrences also appear in the overdue section when late; the summary counts are intentionally overlapping.
- Historical repeats are not accumulated into an invented backlog. Date-only tasks become overdue after their local day; timed tasks become overdue after the due minute. Undated and completed tasks are excluded. Task rows explicitly say Open Tasks because that screen has no direct editor navigation interface.
- Alarm display is a projection of existing saved configuration, not a separate scheduler or confirmation that Android will deliver it. Disabled alarms are excluded. Empty weekdays means once and uses scheduledFor exactly; expired once alarms are not moved to tomorrow. Missing weekdays retains the existing legacy daily default. Recurring weekdays use device-local calendar days and strict future times. Invalid/missing data and DST/offset-transition days show an actionable unknown-time row, excluded from the upcoming count, instead of guessing native Calendar resolution.
- Snapshots refresh on open/reopen, reminder/alarm prop changes, task-store changes, foreground return, Refresh, and every 30 seconds while mounted. Local midnight/timezone changes become visible on the next refresh (up to 30 seconds). Stale async responses and responses after unmount are discarded. A failed refresh hides summary/rows and shows retry, rather than presenting stale counts as current.
- Selectors are memoized. Dashboard navigation itself never saves/completes/snoozes an item. Editors retain their existing explicit save actions.

## Validation

- TypeScript and Expo lint: passed.
- Node tests: 41 passed (33 existing plus eight dashboard groups). Covers local midnight, once/daily/weekly/monthly/selected-day/yearly occurrences, completion-through, snooze, prior occurrences, leap-year/year boundaries, tasks, disabled/expired/legacy alarms, invalid records and read-only loading. Timezone tests run separate Node processes in UTC, America/New_York, Asia/Kolkata and Pacific/Auckland, including a DST gap warning.
- Android Hermes export and Expo config introspection: passed. No native compilation performed; no native code changed.
- Alarm patch: all four native source hashes verified; patch/postinstall/config/dependencies match 8699bd5 unchanged.
- Expo Doctor: 20/21, with existing patch recommendations for expo 57.0.27 (~57.0.33), notifications 57.0.22 (~57.0.25), task-manager 57.0.21 (~57.0.23), updates 57.0.25 (~57.0.28). No upgrades made.
- git diff --check: passed.

## Limitations and Samsung acceptance

Existing Matrix monthly display helpers clamp a missing date (e.g. January 31 -> February's last day), while notifications use a calendar-day trigger. This pre-existing mismatch is not repaired here; dashboard display is not proof of OS delivery. Alarm clock-change resolution, permission status and actual pending schedules are not independently queried. Device rendering, accessibility and editor transitions remain unverified.

After a separately authorized preview build, install over the existing app with the same signing key and package ID; never uninstall or clear storage for this test.

1. Open Today from Home and the menu; test Back/hardware Back, dark/light/system themes, large fonts, narrow screen and Android status/navigation-bar insets.
2. Create once/daily/weekly/monthly and selected-day reminders through existing editors. Verify today/overdue counts and ordering before/after due time; complete one recurring occurrence and verify later occurrences remain. Test future start dates and month-end dates.
3. Snooze through existing notification actions: overdue highlighting waits until the snooze deadline. Return to Today after Complete/Delete/Snooze; verify updated data and no extra schedules or duplicate reminders.
4. Test enabled/disabled, once/expired, daily and selected-day alarms; compare projected dates to the existing Alarms UI. Check unknown-time warnings around clock changes. Verify row taps open the existing editor and Cancel saves nothing.
5. Test dated/timed/date-only/undated/completed tasks, including an overdue previous-day task; rows open Tasks. Test no-data sections, loading and retry on a simulated storage read failure without clearing real data.
6. Leave Today open over midnight, background/return and change device timezone. Refresh and check local date boundaries. Confirm no date is derived from UTC task-date parsing.
7. Regression: ring and flip-silence an alarm (face up/upright first, then sustained face down); repeat locked and with vibration; verify its next recurring occurrence still rings. Recheck notification actions/snooze, notes, calendar, tasks, timer, stopwatch and restart persistence. Record actual APK version/build and results; do not treat baseline acceptance as established by this report.
