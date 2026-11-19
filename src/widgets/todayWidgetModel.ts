import type { Reminder, MatrixAlarm } from '../services/reminders';
import { formatTime, getRecurrence } from '../services/reminders';
import { todayReminders, overdueReminders, nextAlarm, localDayKey } from '../services/todayDashboard';
import { reminderPriority, compareReminderPriority, ReminderPriority } from '../services/reminderMetadata';

export const WIDGET_NAME = 'MatrixCompatibility'; // Retain the Samsung-verified component identity.
export interface WidgetRow { id: string; title: string; time: string; priority: ReminderPriority }
export interface TodayWidgetModel {
  state: 'ready' | 'error'; date: string; updated: string; rows: WidgetRow[];
  alarm: string; warning: boolean;
}
export const priorityPresentation = (priority: ReminderPriority) => ({
  high: { label: 'HIGH', color: '#FF7777', lightColor: '#B42318' }, medium: { label: 'MED', color: '#E7AC35', lightColor: '#7A5000' },
  low: { label: 'LOW', color: '#299D91', lightColor: '#06675E' }, none: { label: '', color: '#89969A', lightColor: '#45585D' },
} as const)[priority];
export function widgetError(now = new Date()): TodayWidgetModel {
  return { state: 'error', date: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    updated: formatTime(now), rows: [], alarm: '', warning: false };
}
export function selectTodayWidget(reminders: Reminder[], alarms: MatrixAlarm[], now: Date): TodayWidgetModel {
  // Shared snapshot validation handles persisted record shape. Reject ambiguous optional state too.
  if (reminders.some(item => (item.completed !== undefined && typeof item.completed !== 'boolean') ||
    [item.completedThrough, item.snoozedUntil].some(value => value !== undefined && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))))) {
    return widgetError(now);
  }
  const end = new Date(now); end.setHours(24, 0, 0, 0);
  // Regular recurring notifications remain scheduled independently of a pending snooze.
  const candidates = todayReminders(reminders, now).map(item => {
    const snooze = new Date(item.reminder.snoozedUntil ?? '');
    return { ...item, due: getRecurrence(item.reminder) === 'once' && snooze > item.date ? snooze : item.date };
  });
  for (const reminder of reminders) {
    const snooze = new Date(reminder.snoozedUntil ?? '');
    if (!(snooze >= now && snooze < end)) continue;
    // Reuse shared completion/recurrence checks to find the uncleared source occurrence.
    // Removing snooze only in this read-only projection avoids suppressing a pending snooze
    // when the original occurrence is on an earlier calendar day.
    const original = getRecurrence(reminder) === 'once'
      ? todayReminders([reminder], new Date(reminder.date))
      : overdueReminders([{ ...reminder, snoozedUntil: undefined }], now);
    if (original.length && original[0].date <= now) candidates.push({ ...original[0], reminder, due: snooze });
  }
  const earliest = new Map<string, typeof candidates[number]>();
  for (const item of candidates) {
    if (item.due < now || item.due >= end) continue;
    const previous = earliest.get(item.reminder.id);
    if (!previous || item.due < previous.due) earliest.set(item.reminder.id, item);
  }
  const upcoming = [...earliest.values()]
    .sort((a, b) => a.due.getTime() - b.due.getTime() || compareReminderPriority(a.reminder, b.reminder) || a.reminder.id.localeCompare(b.reminder.id));
  const enabled = alarms.filter(item => item.enabled);
  const calculated = enabled.map(item => ({ alarm: item, ...nextAlarm(item, now) }));
  const known = calculated.filter(item => item.date !== null).sort((a,b) => a.date!.getTime() - b.date!.getTime());
  const warning = calculated.some(item => !!item.reason);
  const first = known[0];
  const alarm = first ? `${warning ? 'Known alarm' : 'Next alarm'}: ${localDayKey(first.date!) === localDayKey(now) ? '' : first.date!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' '}${formatTime(first.date!)}${first.alarm.title?.trim() ? ' · ' + first.alarm.title.trim() : ''}`
    : warning ? 'Alarm time unavailable · open Today' : 'No upcoming alarm';
  return { state: 'ready', date: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), updated: formatTime(now),
    rows: upcoming.map(({ reminder, due }) => ({ id: reminder.id, title: reminder.title.trim() || 'Reminder', time: formatTime(due), priority: reminderPriority(reminder) })), alarm, warning };
}
