# Phase 2: Reminder Lists & Priorities

## Baseline, verification and merge review

Started with feature/today-dashboard exactly at f24ada15890243fe9d9234ea824d15ff60c5f4d0 and a clean working tree. Created feature/reminder-lists-priorities directly from f24ada1. feature/ios-support remains isolated at e315558. No merge, push, OTA publication, APK build, signing or version/configuration change was performed. Changes are uncommitted.

Recorded the user's Samsung confirmation in TODAY_DASHBOARD_PHASE1.md: Today Dashboard OTA received; reminders and alarms displayed correctly; item navigation worked; an alarm rang; Flip to Silence successfully stopped it. This is user-reported verification, not an independent agent/device test. No additional tests, APK/build number, lock-screen behavior or recurrence delivery are claimed.

Prepared dashboard merge review: main remains at 5874270 and is an ancestor of f24ada1, so the dashboard candidate is eligible for a fast-forward after explicit approval. The net main-to-f24ada1 diff has 14 files: dashboard/read-only helpers/tests/report, voice-removal report, hardened editor save, flip regression tests/runner and app version 1.5.0. Native alarm patch/hash verification, native flip bridge, notification task, dependencies and existing EAS profiles are identical. No iOS commit is included. The ancestry includes historical voice experiments whose files are removed in the final tree; review the net tree, not an individual old commit. Approval must target f24ada1 specifically, not this new unverified Phase 2 branch. No merge was executed and main was not moved.

## Files changed

- App.tsx: list manager, metadata controls in both reminder forms, list/priority/completion filters, priority-first ordering and indicators, and metadata-only edit routing. Catalog read failures block existing-reminder editing rather than silently dropping an assignment.
- src/components/ReminderMetadataControls.tsx: reusable themed list/priority controls, list create/rename/delete management, confirmation and failure feedback. Reuses TaskButton/theme styling; task behavior is unchanged.
- src/services/reminderMetadata.ts: priority types/defaults, active-list resolution, combined filters and priority comparator.
- src/services/reminders.ts: optional priority/listId fields, new list catalog CRUD, validation and serialized metadata-only updates; full reminder commit validates additive metadata before entering its unchanged scheduling path.
- src/screens/TodayDashboard.tsx: reminder priority indicators, high-first ordering and priority filter. Filter changes reminder counts/rows only, leaving alarms and tasks visible. Existing occurrence logic remains unchanged.
- test/reminders.test.cjs: catalog CRUD, failure/migration/deletion/metadata/recurring-action regressions and explicit scheduling-call counters.
- test/reminderMetadata.test.cjs: legacy defaults, combined filtering and stable priority sorting.
- TODAY_DASHBOARD_PHASE1.md: exact user-reported Samsung acceptance record.
- PHASE2_REMINDER_LISTS.md: this report.

## Data and migration behavior

Existing reminder IDs, date/recurrence fields, OS request IDs and all existing AsyncStorage keys remain intact. There is no startup rewrite or destructive bulk migration. Missing/unknown priority displays as none. Missing, orphaned or deleted-list assignment displays as Unassigned; display defaults do not alter raw records. Reads preserve unknown fields. Saving a reminder explicitly persists valid priority and optional listId.

Only the new list entity uses a new key: matrix.reminder-lists.v1, containing schemaVersion 1 and a list array. Existing task lists/priorities are not reused as reminder records. IDs are stable; list names are trimmed, 1-60 characters, case-insensitively unique among active lists. Rename keeps the ID and assignments. Malformed/future catalog schemas or duplicate IDs refuse writes rather than reset storage; additional catalog/list fields are retained.

Delete keeps every reminder. Under the existing shared reminder mutation queue it first writes a durable deletion marker, then removes only that listId from the latest reminder records. Neither stage schedules/cancels notifications. Deleted IDs are never reused and cannot be selected by stale editors. If interrupted after the marker, surviving raw references resolve logically to Unassigned; cleanup failure shows a warning and retains reminder data. A subsequent explicit deletion call can retry cleanup. Markers are retained rather than compacted. AsyncStorage writes across keys are not a cross-process transaction; tombstones make interruption safe for list resolution, but the existing independent-runtime concurrent-writer limitation remains.

Metadata-only saves update priority/listId on freshly read records without changing date, recurrence, completion-through, snooze, request IDs or unknown fields. This also allows categorizing an expired or completed reminder without rescheduling it. Notification actions and existing star/checklist merges preserve additive fields. Changing title/time/recurrence/checklist still uses the existing editor commit and its existing notification replacement/rollback behavior; this phase does not redefine that behavior.

Priority order is high, medium, low, none, followed by existing starred/date ordering on the reminder screen and occurrence-time ordering on Today. Filters are local UI state, not stored preferences. Completion filtering follows existing whole-record completed semantics; a completed occurrence never marks a repeating series globally done. Today retains its occurrence-level completedThrough handling. List deletion while filtering that list switches to Unassigned, retaining visibility of its reminders.

## Validation

- TypeScript: passed.
- Expo lint: passed.
- Node tests: 51 passed (41 prior plus 10 new groups). Covers list create/rename/delete, duplicate names, stable IDs, legacy non-rewrite defaults, unsupported/malformed catalog preservation, unknown fields, disk-write failure, interrupted deletion/retry, stale deleted-list rejection, combined filters, stable priority order and recurring notification completion. Metadata-only updates/delete assert zero scheduling and cancellation calls, retained alert IDs/snooze/completion and untouched notes/alarms.
- Android Hermes export: passed (.expo/phase2-reminder-lists-final-export, 694 modules).
- Expo config introspection: passed. App/package/runtime/signing/EAS/dependencies/native plugin configuration unchanged from f24ada1.
- Native alarm patch: all four source hashes pass. Patch, postinstall verifier/hash list, native flip bridge, notification task and task store are unchanged.
- Expo Doctor: 20/21. Same existing patch recommendations: expo 57.0.27/~57.0.33, notifications 57.0.22/~57.0.25, task-manager 57.0.21/~57.0.23, updates 57.0.25/~57.0.28. No dependency upgrades.
- git diff --check: passed.
- No native compilation or Phase 2 Samsung testing performed. Native code did not change.

## Limitations and Samsung test steps

New list screens/controls, metadata-only form detection and selection styling need device verification. Filters reset after process restart. Deleted list markers remain in the catalog. Existing monthly occurrence-vs-calendar-trigger mismatch and Today clock-change warnings remain unchanged. Existing queue serialization protects one JS runtime, not a database transaction across independent headless runtimes. Older JS releases ignore metadata; do not use destructive downgrade/reinstallation as a migration test.

After a separately authorized delivery, preserve the installed app and its data:

1. Check legacy reminders still display with correct IDs/recurrence, none priority and Unassigned, with original alerts and saved notes/tasks/alarms intact.
2. In Reminders, create Work/Home lists, reject blank/duplicate names, rename Work and confirm assigned reminders stay assigned. Restart and check persistence.
3. Create and edit reminders using both inline and calendar/editor forms. Exercise all four priorities and optional assignment. Cancel must not save. For metadata-only edits, confirm the due date, recurrence, existing completion and snooze remain unchanged and no duplicate alert appears.
4. Combine list/Unassigned, priority and completion filters with Today/All/Starred/Done views. Check high-first order and ties. On Today, confirm priority labels/filters and filtered reminder counts; alarms and tasks must remain visible.
5. Delete a list after confirmation. All its reminders must remain Unassigned with existing alerts intact. Cancel deletion and verify no change. Check filtering the deleted list transitions to Unassigned. Test storage-failure feedback only on disposable/test data, without clearing real data.
6. Complete or snooze a recurring reminder through existing notification actions; ensure priority/list survive and later occurrences remain scheduled. Reopen/edit a reminder after deletion or notification changes to check stale-data behavior.
7. Recheck reminder once/daily/weekly/monthly/selected-day delivery, calendar, notes, tasks, themes, safe areas, timer and stopwatch. Ring an alarm and test Flip to Silence again as a Phase 2 regression; the earlier user confirmation is not evidence this new code has passed device acceptance.
