import { readReminderAlarmSnapshot } from '../services/dashboardSnapshot';
import { selectTodayWidget, widgetError, TodayWidgetModel } from './todayWidgetModel';
// Bounded, fresh persisted reads. No cache keys, migration, writes or notification calls.
export async function loadTodayWidget(): Promise<TodayWidgetModel> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      readReminderAlarmSnapshot(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Widget read timeout')), 4000); }),
    ]);
    return selectTodayWidget(snapshot.reminders, snapshot.alarms, new Date());
  } catch { return widgetError(); }
  finally { if (timeout !== undefined) clearTimeout(timeout); }
}
