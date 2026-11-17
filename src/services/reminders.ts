import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
export const STORAGE_KEY = "matrix.reminders.v1";
export const NOTES_KEY = "matrix.notes.v1";
export const SETTINGS_KEY = "matrix.settings.v1";
export const ALARMS_KEY = "matrix.alarms.v1";
export const NOTIFICATION_CATEGORY = "MATRIX_REMINDER";
export type Recurrence = "once" | "daily" | "weekly" | "selectedDays" | "monthly" | "yearly";
export type AppView = "today" | "all" | "starred" | "completed";
export type MatrixAlarm = {
  id: string;
  title?: string;
  hour: number;
  minute: number;
  enabled: boolean;
  sound: "default" | "silent" | "custom";
  soundUri?: string;
  soundLabel?: string;
  notificationId?: string;
  notificationIds?: string[];
  weekdays?: number[];
  scheduledFor?: string;
};
export type ClockTab = "alarm" | "timer" | "stopwatch";
export type AppSettings = {
  flipToSilence: boolean;
  notificationsEnabled: boolean;
  defaultSnoozeMinutes: number;
  weekStartsMonday: boolean;
  hideCompleted: boolean;
  theme: "default" | "dark" | "light" | "system";
};
export const DEFAULT_SETTINGS: AppSettings = {
  flipToSilence: true,
  notificationsEnabled: true,
  defaultSnoozeMinutes: 15,
  weekStartsMonday: false,
  hideCompleted: true,
  theme: "default",
};
export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};
export type Reminder = {
  id: string;
  title: string;
  description?: string;
  completedThrough?: string;
  snoozedUntil?: string;
  date: string;
  notificationId: string;
  recurrence?: Recurrence;
  weekdays?: number[];
  notificationIds?: string[];
  completed?: boolean;
  starred?: boolean;
  subtasks?: Subtask[];
};
export type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};
export const NOTIFICATION_ACTIONS: Notifications.NotificationAction[] = [
  { identifier: "MARK_COMPLETED", buttonTitle: "Mark Completed", options: { opensAppToForeground: Platform.OS !== "android" } },
  { identifier: "DELETE", buttonTitle: "Delete", options: { isDestructive: true, opensAppToForeground: Platform.OS !== "android" } },
  { identifier: "SNOOZE_DEFAULT", buttonTitle: "Snooze", options: { opensAppToForeground: Platform.OS !== "android" } },
];
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
// One queue coordinates listener, launch, background, and UI completion paths.
let mutationQueue: Promise<unknown> = Promise.resolve();
export function serializeReminderMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(work);
  mutationQueue = result.catch(() => undefined);
  return result;
}
export async function cancelReminderNotifications(
  reminderId: string, fallbackNotificationId?: string, exceptNotificationId?: string | string[],
) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ids = new Set(scheduled.filter(item => item.content.data?.reminderId === reminderId)
    .map(item => item.identifier));
  if (fallbackNotificationId) ids.add(fallbackNotificationId);
  for (const id of Array.isArray(exceptNotificationId) ? exceptNotificationId : [exceptNotificationId ?? ""]) ids.delete(id);
  await Promise.all([...ids].map(id => Notifications.cancelScheduledNotificationAsync(id)));
}
export function reminderContent(reminder: Pick<Reminder, "id" | "title" | "description">): Notifications.NotificationContentInput {
  return {
    title: reminder.title, body: reminder.description?.trim() || undefined,
    sound: "default", categoryIdentifier: NOTIFICATION_CATEGORY,
    data: { reminderId: reminder.id, title: reminder.title },
  };
}
export function handleNotificationResponse(response: Notifications.NotificationResponse) {
  return serializeReminderMutation(async () => {
    const { actionIdentifier: action, notification } = response;
    if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const request = notification.request;
    // Repeating requests reuse identifiers: include the delivery timestamp.
    const key = `${request.identifier}:${notification.date}:${action}`;
    const receiptKey = "matrix.notification-actions.v1";
    const receipts: string[] = JSON.parse(await AsyncStorage.getItem(receiptKey) || "[]");
    if (receipts.includes(key)) {
      await Notifications.dismissNotificationAsync(request.identifier);
      return;
    }
    // TaskManager receives the native payload without the listener's dataString mapping.
    const content = request.content as Notifications.NotificationContent & { dataString?: string };
    const data = content.data ?? (typeof content.dataString === "string" ? JSON.parse(content.dataString) as Record<string, unknown> : {});
    const reminderId = data.reminderId;
    const reminders: Reminder[] = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || "[]");
    const reminder = reminders.find(item => item.id === reminderId);
    let updated = reminders;
    if (reminder && action === "DELETE") {
      await cancelReminderNotifications(reminder.id, reminder.notificationId);
      updated = reminders.filter(item => item.id !== reminder.id);
    } else if (reminder && action === "MARK_COMPLETED") {
      const recurring = getRecurrence(reminder) !== "once";
      // Keep the existing repeating OS request; complete only this occurrence.
      const through = new Date(Math.max(notification.date, reminder.completedThrough ? new Date(reminder.completedThrough).getTime() : 0)).toISOString();
      updated = reminders.map(item => item.id === reminder.id
        ? { ...item, completed: !recurring, completedThrough: through, snoozedUntil: undefined } : item);
      if (!recurring) await cancelReminderNotifications(reminder.id, reminder.notificationId);
      else await cancelSnoozes(reminder.id);
    } else if (reminder && !reminder.completed) {
      const durations: Record<string, number> = { SNOOZE_5: 5, SNOOZE_15: 15, SNOOZE_60: 60, SNOOZE_TOMORROW: 1440 };
      const settings = JSON.parse(await AsyncStorage.getItem(SETTINGS_KEY) || "{}");
      const minutes = action === "SNOOZE_DEFAULT" ? (settings.defaultSnoozeMinutes ?? 15) : durations[action];
      if (Number.isFinite(minutes) && minutes > 0) {
        // Stable ID makes retries replace the pending snooze rather than duplicate it.
        const id = `matrix-snooze-${reminder.id}`;
        const date = new Date(Date.now() + minutes * 60000);
        await Notifications.scheduleNotificationAsync({
          identifier: id,
          content: { ...reminderContent(reminder), data: { ...reminderContent(reminder).data, isSnoozed: true } },
          trigger: buildTrigger(date, "once"),
        });
        updated = reminders.map(item => item.id === reminder.id ? { ...item, snoozedUntil: date.toISOString() } : item);
      } else if (action !== "DISMISS") return;
    }
    // Persist state and deduplication receipts together before dismissing the banner.
    await AsyncStorage.multiSet([
      [STORAGE_KEY, JSON.stringify(updated)],
      [receiptKey, JSON.stringify([...receipts, key].slice(-200))],
    ]);
    await Notifications.dismissNotificationAsync(request.identifier);
  });
}
async function cancelSnoozes(reminderId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter(item => item.content.data?.reminderId === reminderId && item.content.data?.isSnoozed)
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}
export function getRecurrence(reminder: Reminder): Recurrence {
  return reminder.recurrence ?? "once";
}
export function getTaskDate(reminder: Reminder, from = new Date()): Date {
  if (getRecurrence(reminder) === "once") {
    return new Date(reminder.date);
  }
  const base = new Date(reminder.date);
  const result = new Date(base);
  result.setSeconds(0, 0);
  if (getRecurrence(reminder) === "selectedDays") {
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(from);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(base.getHours(), base.getMinutes(), 0, 0);
      if (candidate > from && (reminder.weekdays ?? []).includes(candidate.getDay())) return candidate;
    }
    return new Date(NaN);
  }
  if (getRecurrence(reminder) === "daily") {
    result.setFullYear(from.getFullYear(), from.getMonth(), from.getDate());
    if (result.getTime() <= from.getTime()) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }
  if (getRecurrence(reminder) === "weekly") {
    result.setFullYear(from.getFullYear(), from.getMonth(), from.getDate());
    const daysAhead = (base.getDay() - result.getDay() + 7) % 7;
    result.setDate(result.getDate() + daysAhead);
    if (result.getTime() <= from.getTime()) {
      result.setDate(result.getDate() + 7);
    }
    return result;
  }
  if (getRecurrence(reminder) === "yearly") {
    result.setFullYear(from.getFullYear(), base.getMonth(), base.getDate());
    if (result.getTime() <= from.getTime())
      result.setFullYear(result.getFullYear() + 1);
    return result;
  }
  const targetDay = base.getDate();
  result.setDate(1);
  result.setFullYear(from.getFullYear(), from.getMonth(), 1);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(targetDay, lastDay));
  if (result.getTime() <= from.getTime()) {
    result.setMonth(result.getMonth() + 1, 1);
    const nextLastDay = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
    ).getDate();
    result.setDate(Math.min(targetDay, nextLastDay));
  }
  return result;
}
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
export function isToday(date: Date): boolean {
  return dateKey(date) === dateKey(new Date());
}
export function reminderOccursOnDate(reminder: Reminder, targetDate: Date): boolean {
  const base = new Date(reminder.date);
  const target = new Date(targetDate);
  if (getRecurrence(reminder) === "once")
    return dateKey(base) === dateKey(target);
  if (getRecurrence(reminder) === "selectedDays") return (reminder.weekdays ?? []).includes(target.getDay());
  if (getRecurrence(reminder) === "daily") return true;
  if (getRecurrence(reminder) === "weekly")
    return base.getDay() === target.getDay();
  if (getRecurrence(reminder) === "yearly") {
    return (
      base.getMonth() === target.getMonth() &&
      base.getDate() === target.getDate()
    );
  }
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  return Math.min(base.getDate(), lastDayOfTargetMonth) === target.getDate();
}
export function getReminderOccurrenceDate(reminder: Reminder, targetDate: Date): Date {
  const base = new Date(reminder.date);
  const result = new Date(targetDate);
  result.setHours(base.getHours(), base.getMinutes(), 0, 0);
  return result;
}
export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
export function recurrenceLabel(recurrence?: Recurrence): string {
  switch (recurrence ?? "once") {
    case "daily":
      return "Repeats daily";
    case "selectedDays":
      return "Selected days";
    case "weekly":
      return "Repeats weekly";
    case "monthly":
      return "Repeats monthly";
    case "yearly":
      return "Repeats yearly";
    default:
      return "One-time reminder";
  }
}
export function buildTrigger(date: Date, recurrence: Recurrence) {
  const channel = Platform.OS === "android" ? { channelId: "reminders" } : {};
  if (recurrence === "daily") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: date.getHours(),
      minute: date.getMinutes(),
      ...channel,
    } satisfies Notifications.NotificationTriggerInput;
  }
  if (recurrence === "weekly") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: date.getDay() + 1,
      hour: date.getHours(),
      minute: date.getMinutes(),
      ...channel,
    } satisfies Notifications.NotificationTriggerInput;
  }
  if (recurrence === "monthly") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      ...channel,
    } satisfies Notifications.NotificationTriggerInput;
  }
  if (recurrence === "yearly") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.YEARLY,
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      ...channel,
    } satisfies Notifications.NotificationTriggerInput;
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
    ...channel,
  } satisfies Notifications.NotificationTriggerInput;
}

export async function scheduleReminder(reminder: Reminder): Promise<string[]> {
  const dates = getRecurrence(reminder) === "selectedDays"
    ? [...new Set(reminder.weekdays ?? [])].map(day => {
      const date = new Date(reminder.date);
      date.setDate(date.getDate() + (day - date.getDay() + 7) % 7);
      return date;
    }) : [new Date(reminder.date)];
  const ids: string[] = [];
  try {
    for (const date of dates) ids.push(await Notifications.scheduleNotificationAsync({
      content: reminderContent(reminder),
      trigger: buildTrigger(date, getRecurrence(reminder) === "selectedDays" ? "weekly" : getRecurrence(reminder)),
    }));
    return ids;
  } catch (error) {
    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
    throw error;
  }
}
export function homeReminderVisible(reminder: Reminder, now: Date): boolean {
  if (reminder.completed || !reminderOccursOnDate(reminder, now)) return false;
  const occurrence = getReminderOccurrenceDate(reminder, now);
  if (occurrence < new Date(reminder.date)) return false;
  return !reminder.completedThrough || occurrence > new Date(reminder.completedThrough);
}
export function homeAlarmVisible(alarm: MatrixAlarm, now: Date): boolean {
  if (!alarm.enabled) return false;
  if (alarm.weekdays?.length === 0) return !!alarm.scheduledFor && dateKey(new Date(alarm.scheduledFor)) === dateKey(now) && new Date(alarm.scheduledFor) > now;
  const today = new Date(now); today.setHours(alarm.hour, alarm.minute, 0, 0);
  return (alarm.weekdays ?? [0,1,2,3,4,5,6]).includes(now.getDay()) && today > now;
}

// Apply only fields changed by this UI render to the newest stored data. A delayed
// star/checklist save must not resurrect a background-deleted or completed task.
export function mergeReminderChanges(base: Reminder[], desired: Reminder[], latest: Reminder[]): Reminder[] {
  const before = new Map(base.map(item => [item.id, item]));
  const after = new Map(desired.map(item => [item.id, item]));
  const result = latest.filter(item => !before.has(item.id) || after.has(item.id)).map(item => {
    const original = before.get(item.id);
    const changed = after.get(item.id);
    if (!original || !changed) return item;
    const patch: Partial<Reminder> = {};
    for (const key of Object.keys(changed) as (keyof Reminder)[]) {
      if (JSON.stringify(changed[key]) !== JSON.stringify(original[key])) {
        Object.assign(patch, { [key]: changed[key] });
      }
    }
    return { ...item, ...patch };
  });
  for (const item of desired) if (!before.has(item.id) && !result.some(value => value.id === item.id)) result.unshift(item);
  return result;
}

// Update legacy pending text without adding another OS request or changing stored records.
export async function refreshLegacyNotificationText(reminders: Reminder[]) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.content.title !== "Matrix Reminder" && request.content.title !== "Matrix Reminder · Snoozed") continue;
    const reminder = reminders.find(item => item.id === request.content.data?.reminderId);
    if (!reminder || reminder.completed) continue;
    const raw = request.trigger as unknown as Record<string, unknown> | null;
    let date = new Date(reminder.date);
    let recurrence = getRecurrence(reminder);
    if (request.content.data?.isSnoozed) {
      // Android's serialized date trigger exposes value rather than input's date.
      const timestamp = raw?.value ?? raw?.date ?? (reminder.snoozedUntil ? new Date(reminder.snoozedUntil).getTime() : undefined);
      if (typeof timestamp !== "number") continue;
      date = new Date(timestamp);
      recurrence = "once";
    }
    if (recurrence === "selectedDays") continue; // New schedules already have the correct text.
    if (recurrence === "once" && date.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: request.identifier,
      content: { ...reminderContent(reminder), data: request.content.data },
      trigger: buildTrigger(date, recurrence),
    });
  }
}

// Shared commit path for the editor and explicitly confirmed voice proposals.
export async function commitReminder(draft: Reminder, options: {
  base?: Reminder[]; notificationsEnabled: boolean; authorized?: () => Promise<boolean>;
}): Promise<{ records: Reminder[]; cleanupFailed: boolean }> {
  return serializeReminderMutation(async () => {
    const authorize = options.authorized ?? (async () => true);
    const valid = async () => {
      if (!await authorize()) throw new Error('Reminder confirmation expired or was cancelled.');
      if (!draft.title.trim() || draft.title.trim().length > 150 || !Number.isFinite(Date.parse(draft.date)) || Date.parse(draft.date) <= Date.now()) throw new Error('Reminder needs a valid title and future time.');
      if (draft.recurrence === 'selectedDays' && !draft.weekdays?.length) throw new Error('Select reminder weekdays.');
    };
    await valid();
    const latest: Reminder[] = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || '[]');
    const base = options.base ?? latest;
    const editing = base.some(item => item.id === draft.id);
    const previous = latest.find(item => item.id === draft.id);
    // Voice session IDs are stable: a repeated confirmed save cannot duplicate it.
    if (!editing && previous) return { records: latest, cleanupFailed: false };
    if (editing && !previous) throw new Error('This reminder was deleted.');
    let ids: string[] = [];
    try {
      ids = options.notificationsEnabled ? await scheduleReminder(draft) : [];
      await valid(); // Recheck cancellation/lock/background and time after scheduling.
      const saved = { ...draft, title: draft.title.trim(), notificationId: ids[0] || '', notificationIds: ids };
      const desired = editing ? base.map(item => item.id === saved.id ? saved : item) : [saved, ...base];
      const records = mergeReminderChanges(base, desired, latest);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      let cleanupFailed = false;
      if (previous) await cancelReminderNotifications(previous.id, previous.notificationId, ids).catch(() => { cleanupFailed = true; });
      return { records, cleanupFailed };
    } catch (error) {
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
      throw error;
    }
  });
}
