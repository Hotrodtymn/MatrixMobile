# Matrix 1.2.0, Phase 1: Task management

Implemented and validated locally. No update has been published and no APK has been built for this phase. Android/iOS UI interaction and physical-device checks remain to be performed.

## Functionality

The navigation menu now has a dedicated **Tasks** entry. The existing reminder entry is labeled **Reminders**. The Tasks page supports creation, editing, deletion with confirmation, completion/reopening, Active/Completed/All filters, and sorting by due date or priority. It uses a virtualized list rather than nesting another list inside the existing app scroll view.

A reusable form supplies a required name, optional description, independently optional due date/time, and High/Medium/Low/None priority. Names are trimmed and required. Date/time fields can be cleared. Save and Cancel remain in a keyboard-aware footer while fields can scroll. The page/form follow the existing light/dark setting and safe areas; controls have 48-point minimum touch targets and wrap for larger text.

Task completion records a UTC completion timestamp, retains the task, and removes it from the active filter after persistence succeeds. Reopening clears the completion timestamp. Editing retains creation/completion metadata and fields outside the edit patch. A changed revision blocks stale edits/completions/deletions; the form offers an explicit reload of the saved version instead of overwriting it.

## Model and storage

`Task` contains ID, title, description, local due date (`YYYY-MM-DD` or null), local due time (`HH:mm` or null), priority, completion state, creation/modification/completion timestamps, and a revision token. A time without a date is valid and does not imply a date or schedule a notification. Date-only tasks follow timed tasks on the same day; undated tasks follow dated tasks. Priority sorts High, Medium, Low, None, with due date and stable IDs resolving ties.

Tasks use the new key **`matrix.tasks.v1`** with `{ schemaVersion: 1, tasks: [...] }`. Reads and writes are serialized, and every mutation reads the newest document and checks the item's revision. No API accepts an entire stale UI list as the replacement document. Storage failures leave UI edits available for retry; successful creation is not retried merely because a subsequent refresh fails.

Missing optional fields get safe defaults. Invalid individual records and ambiguous duplicate IDs are omitted from the editable list but retained in storage. A warning explains that some tasks could not be loaded. Malformed whole documents and unknown future schema versions block writes rather than resetting data. Extra document and task fields are preserved for future extensions.

The model, storage adapter, selectors, hook, form, and page are separate so future dashboards, progress queries, projects, subtasks, recurrence, search, calendar integration, and optional notifications can build on them. None of those future features is implemented here. The write queue protects this app's single JS runtime and multiple store instances; a future independently running background task writer would require its own concurrency design.

## Files changed in this phase

| File | Purpose |
| --- | --- |
| `App.tsx` | Tasks menu entry and conditional page mounting; small navigation integration only |
| `src/models/task.ts` | Task types, field validation, safe record decoding, sorting/filtering |
| `src/services/taskStore.ts` | Versioned CRUD storage, revision checks, serialized fresh-data mutations |
| `src/services/taskStorage.ts` | Existing AsyncStorage adapter/singleton |
| `src/hooks/useTasks.ts` | Reads, subscriptions, resume refresh, loading/error state |
| `src/screens/TasksPage.tsx` | Virtualized list, filters/sort, completion, edit/delete actions |
| `src/components/tasks/TaskForm.tsx` | Reusable create/edit modal and existing date/time picker integration |
| `src/components/tasks/TaskButton.tsx` | Shared accessible task control |
| `src/components/tasks/taskTheme.ts` | Task colors/styles matching existing themes |
| `test/tasks.test.cjs` | Fourteen new automated task tests |
| `TASKS_PHASE1.md` | Delivery and Android test instructions |

The existing menu uses local screen state rather than Expo Router. This phase extends that pattern to preserve the working architecture and OTA compatibility; it does not migrate navigation or add native dependencies.

## Baseline preservation

A source snapshot was saved before changes at `/private/tmp/matrix-1.1.1-baseline-before-tasks.tar.gz`. The directory already contained uncommitted 1.1.x work; that work was retained.

Compared byte-for-byte with the snapshot, `app.json`, `eas.json`, `package.json`, `package-lock.json`, `index.ts`, reminder/notification services, native alarm settings, the native alarm patch, and its source hash manifest are unchanged. `App.tsx` changes are confined to the Tasks import/state, menu selection, and mounting the page outside the old scroll container. Home contents, existing calendar, settings, alarms, reminders, snooze, notes, and scheduling code were not rewritten. Unit tests seed existing reminder/alarm/note/settings keys and verify task operations leave them untouched.

## Validation performed

Before implementation: all 12 existing tests, TypeScript, lint, Kotlin flip detector tests, and native patch hash verification passed.

The model/storage operations were validated before page implementation. After integration:

- `npm test`: **26 passed** (12 existing + 14 task tests).
- `npx tsc --noEmit`: passed.
- `npx expo lint`: passed with no warnings.
- `npx expo export --platform all --output-dir /private/tmp/matrix-1.2-phase1-export`: Android and iOS Hermes exports passed.
- `node scripts/verify-flip-patch.cjs`: all four native source hashes still match the stable flip-v2 implementation.
- `git diff --check`: passed.

Task tests cover creation, optional fields, editing and clearing dates/times, future-field preservation, persistence/restart, completion and reopening, deletion, priority/due sorting, invalid inputs, stale edits/completions/deletions, concurrent creates, concurrent same-revision saves, malformed records/documents, duplicate IDs, failed writes, and queue recovery.

The UI has been typechecked and bundled; no physical Android or iOS interaction has been claimed. Check the form, native date/time dialogs, keyboard, large text, and navigation on the phone before promoting this phase beyond preview.

## OTA strategy

**This phase can target the existing Matrix 1.1.1 preview runtime through EAS Update.** All dependencies and native/configuration files are unchanged. `expo.version` remains **1.1.1** because the current `appVersion` runtime policy derives the OTA runtime from it. “1.2.0 Phase 1” is the feature milestone, not a new native runtime. Bumping `expo.version` to 1.2.0 now would target a different runtime and prevent the installed 1.1.1 APK from receiving the update. See [Expo runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).

No new APK is needed for this task phase, and no EAS Update publication was executed. Publishing to `preview` affects compatible installations on that channel; it is separate from the local validation already completed.

## Exact Android commands

From the project directory, rerun validation:

```sh
npm test
npx tsc --noEmit
npx expo lint
node scripts/verify-flip-patch.cjs
npx expo export --platform android --output-dir /private/tmp/matrix-1.2-phase1-android
```

When ready to deliver the validated feature to the existing **1.1.1 preview APK**, publish the JavaScript update (this command has **not** been run):

```sh
npx eas-cli@latest update --channel preview --platform android --environment preview --message "Matrix 1.2.0 Phase 1: task management" --non-interactive
```

Allow the release app to download the update on launch, then force-close and reopen it again to load it, following [Expo's release-build test instructions](https://docs.expo.dev/eas-update/getting-started/). With USB debugging and ADB, each close/reopen can be performed with:

```sh
adb shell am force-stop com.hotrodtymn.matrix
adb shell monkey -p com.hotrodtymn.matrix -c android.intent.category.LAUNCHER 1
```

Give the first launch time to download before repeating the two commands. Do not uninstall the app or clear storage.

For Metro development instead of OTA, a development build containing the existing native alarm module is required; Expo Go cannot load that module. If such a development build is already installed:

```sh
npx expo start --dev-client --android
```

The standalone preview APK is not a development client, so Metro alone will not update it. No new development APK is built by these instructions.

## Android smoke test

1. Open menu → Tasks. Create an undated task, a date-only task, a time-only task, and a task with both date/time.
2. Edit each field; clear due fields; cancel an edit; verify the name cannot be empty and Cancel leaves storage unchanged.
3. Create all four priority levels. Sort by Priority and Due date; confirm undated tasks follow dated tasks.
4. Complete a task in Active; verify it disappears, appears under Completed, and can be reopened. Confirm All retains both statuses.
5. Delete a task with confirmation. Close/reopen the app and verify edits, completion/reopening, and deletion persist.
6. Check light/dark/system theme, native date/time picker cancel/confirm, hardware Back, keyboard, camera cutout/navigation bar insets, small screen/landscape, and large accessibility text. Save/Cancel must stay reachable.
7. Verify existing notes, reminders, notification completion/delete/snooze, recurrence, alarms, Flip to Silence, Home clearing, settings, and the existing calendar still work. Tasks should not appear on Home or the existing calendar in this phase.
