import { Reminder, MatrixAlarm, getRecurrence, reminderOccursOnDate, getReminderOccurrenceDate } from './reminders';
import { Task } from '../models/task';

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const validDate = (value: Date) => Number.isFinite(value.getTime());
export interface ReminderOccurrence { reminder: Reminder; date: Date; overdue: boolean }
function occurrence(reminder: Reminder, day: Date): Date | null {
  const base = new Date(reminder.date);
  if (!validDate(base) || reminder.completed || !reminderOccursOnDate(reminder, day)) return null;
  const date = getRecurrence(reminder) === 'once' ? base : getReminderOccurrenceDate(reminder, day);
  if (!validDate(date) || date < base) return null;
  // Reuse the completion-through semantics: a recurring record is not globally completed.
  if (reminder.completedThrough && date <= new Date(reminder.completedThrough)) return null;
  return date;
}
function effectiveDue(reminder: Reminder, date: Date): Date {
  const snooze = new Date(reminder.snoozedUntil ?? '');
  return validDate(snooze) && snooze > date ? snooze : date;
}
export function todayReminders(reminders: readonly Reminder[], now: Date): ReminderOccurrence[] {
  return reminders.flatMap(reminder => {
    const date = occurrence(reminder, now);
    return date ? [{ reminder, date, overdue: effectiveDue(reminder, date) < now }] : [];
  }).sort((a,b) => a.date.getTime()-b.date.getTime());
}
export function overdueReminders(reminders: readonly Reminder[], now: Date): ReminderOccurrence[] {
  return reminders.flatMap(reminder => {
    if (reminder.completed || !validDate(new Date(reminder.date)) || new Date(reminder.date) > now) return [];
    const recurrence = getRecurrence(reminder);
    if (recurrence === 'once') {
      const date = occurrence(reminder, new Date(reminder.date));
      return date && effectiveDue(reminder, date) < now ? [{ reminder, date, overdue: true }] : [];
    }
    // Search calendar dates using the existing occurrence predicates, not new recurrence rules.
    // Leap-day yearly records can be four years apart. No missed-occurrence backlog is invented.
    const limit = recurrence === 'yearly' ? 1461 : recurrence === 'monthly' ? 31 : recurrence === 'daily' ? 1 : 7;
    for (let offset = 0; offset <= limit; offset++) {
      const day = new Date(now); day.setDate(day.getDate()-offset);
      const date = occurrence(reminder, day);
      if (date && date < now) return effectiveDue(reminder, date) < now ? [{ reminder, date, overdue: true }] : [];
    }
    return [];
  }).sort((a,b) => a.date.getTime()-b.date.getTime());
}
export type NextAlarm = { date: Date | null; reason?: string };
export function nextAlarm(alarm: MatrixAlarm, now: Date): NextAlarm {
  if (!alarm.enabled) return { date: null };
  if (!Number.isInteger(alarm.hour) || alarm.hour < 0 || alarm.hour > 23 || !Number.isInteger(alarm.minute) || alarm.minute < 0 || alarm.minute > 59) return { date: null, reason: 'Invalid alarm time; review in Alarms.' };
  const days = alarm.weekdays ?? [0,1,2,3,4,5,6]; // Existing legacy default is daily.
  if (!Array.isArray(days) || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return { date: null, reason: 'Invalid repeat days; review in Alarms.' };
  if (!days.length) {
    const date = new Date(alarm.scheduledFor ?? '');
    if (!validDate(date)) return { date: null, reason: 'One-time date is missing; review in Alarms.' };
    return { date: date > now ? date : null }; // Never resurrect an expired one-time alarm tomorrow.
  }
  for (let offset=0; offset<=7; offset++) {
    const date = new Date(now); date.setDate(date.getDate()+offset); date.setHours(alarm.hour, alarm.minute,0,0);
    if (!days.includes(date.getDay())) continue;
    const start = new Date(date); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+1);
    // Calendar/native overlap and gap resolution has not been device-verified. Be conservative.
    if (start.getTimezoneOffset() !== end.getTimezoneOffset() && end > now) return { date: null, reason: 'Clock-change day: confirm the next alarm in Alarms.' };
    if (date > now) return { date };
  }
  return { date: null, reason: 'Next time unavailable; review in Alarms.' };
}
export function todayTasks(tasks: readonly Task[], now: Date): Task[] {
  return tasks.filter(task => !task.completed && task.dueDate === localDayKey(now))
    .sort((a,b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'));
}
export function taskOverdue(task: Task, now: Date): boolean {
  if (task.completed || !task.dueDate) return false;
  const today = localDayKey(now);
  // A date-only task is due through the end of its local day; no invented midnight deadline.
  return task.dueDate < today || (task.dueDate === today && !!task.dueTime && task.dueTime < `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
}
