import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALARMS_KEY, STORAGE_KEY, Reminder, MatrixAlarm } from './reminders';
import { taskStore } from './taskStorage';

function records<T>(raw: string | null, label: string): T[] {
  const value: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string')) throw new Error(`${label} could not be read.`);
  if (new Set(value.map(item => item.id)).size !== value.length) throw new Error(`${label} contain duplicate IDs.`);
  return value as T[];
}
// Read-only snapshot: no writes, migrations, permission requests or scheduling.
export async function readDashboard() {
  const [reminders, alarms, tasks] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(ALARMS_KEY), taskStore.list(),
  ]);
  const reminderRecords = records<Reminder>(reminders, 'Reminders');
  const alarmRecords = records<MatrixAlarm>(alarms, 'Alarms');
  if (reminderRecords.some(item => typeof item.title !== 'string' || typeof item.date !== 'string' || !Number.isFinite(Date.parse(item.date)) ||
    (item.recurrence !== undefined && !['once','daily','weekly','monthly','yearly','selectedDays'].includes(item.recurrence)) ||
    (item.weekdays !== undefined && (!Array.isArray(item.weekdays) || item.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6))))) throw new Error('Reminders could not be read.');
  if (alarmRecords.some(item => typeof item.enabled !== 'boolean' || (item.title !== undefined && typeof item.title !== 'string'))) throw new Error('Alarms could not be read.');
  return { reminders: reminderRecords, alarms: alarmRecords, ...tasks };
}
