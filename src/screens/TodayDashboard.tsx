import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { taskTheme } from '../components/tasks/taskTheme';
import { TaskButton } from '../components/tasks/TaskButton';
import { MatrixAlarm, Reminder, formatTime, formatDate } from '../services/reminders';
import { taskStore } from '../services/taskStorage';
import { readDashboard } from '../services/dashboardSnapshot';
import { todayReminders, overdueReminders, nextAlarm, todayTasks, taskOverdue } from '../services/todayDashboard';

type Snapshot = Awaited<ReturnType<typeof readDashboard>>;
export function TodayDashboard({ light, reminders, alarms, onBack, onReminder, onAlarm, onTasks }: {
  light: boolean; reminders: Reminder[]; alarms: MatrixAlarm[]; onBack: () => void;
  onReminder: (item: Reminder) => void; onAlarm: (item: MatrixAlarm) => void; onTasks: () => void;
}) {
  const theme = taskTheme(light);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await readDashboard();
      if (request === generation.current) { setSnapshot(result); setError(false); }
    } catch { if (request === generation.current) setError(true); }
    finally { if (request === generation.current) { setRefreshing(false); setNow(new Date()); } }
  }, []);
  useEffect(() => {
    const lifecycle = generation;
    const timer = setInterval(() => void refresh(), 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const unsubscribe = taskStore.subscribe(() => void refresh());
    return () => { lifecycle.current++; clearInterval(timer); subscription.remove(); unsubscribe(); };
  }, [refresh]);
  useEffect(() => {
    const reload = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(reload);
  }, [reminders, alarms, refresh]);
  const { today, overdue, upcoming, unknown, tasks, overdueTasks } = useMemo(() => {
    const today = todayReminders(snapshot?.reminders ?? [], now);
    const overdue = overdueReminders(snapshot?.reminders ?? [], now);
    const alarmRows = (snapshot?.alarms ?? []).filter(item => item.enabled).map(alarm => ({ alarm, ...nextAlarm(alarm, now) }));
    const upcoming = alarmRows.filter(row => row.date).sort((a,b) => a.date!.getTime()-b.date!.getTime());
    const unknown = alarmRows.filter(row => row.reason);
    const tasks = todayTasks(snapshot?.tasks ?? [], now);
    const overdueTasks = (snapshot?.tasks ?? []).filter(task => taskOverdue(task, now));
    return { today, overdue, upcoming, unknown, tasks, overdueTasks };
  }, [snapshot, now]);
  const row = (key: string, title: string, detail: string, late: boolean, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: late ? theme.error : theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={{ color: late ? theme.error : theme.muted }}>{detail}</Text>
    </Pressable>
  );
  const empty = (text: string) => <Text style={[styles.empty, { color: theme.muted }]}>{text}</Text>;
  const heading = (text: string) => <Text style={[styles.heading, { color: theme.text }]}>{text}</Text>;
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
    <View style={styles.header}><Text style={[styles.pageTitle, { color: theme.text }]}>Today</Text><TaskButton label="Back" theme={theme} onPress={onBack} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={{ color: theme.muted }}>{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
      {refreshing && <Text accessibilityRole="progressbar" style={{ color: theme.muted }}>Loading today…</Text>}
      <TaskButton label="Refresh" theme={theme} onPress={() => void refresh()} disabled={refreshing} />
      {error ? <Text accessibilityRole="alert" style={{ color: theme.error }}>Today could not be loaded. Tap Refresh to retry. Your saved data has not been changed.</Text> : snapshot && <>
        <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.text }}>{today.length} today’s reminders · {upcoming.length} upcoming alarms · {overdue.length} overdue reminders</Text>
        </View>
        {heading('Today’s reminders')}
        {today.length ? today.map(({reminder, date, overdue: late}) => row(reminder.id, reminder.title, `${formatTime(date)}${late ? ' · Overdue' : ''}${reminder.snoozedUntil && new Date(reminder.snoozedUntil) > date ? ` · Snoozed until ${formatDate(reminder.snoozedUntil)} ${formatTime(reminder.snoozedUntil)}` : ''} · Open reminder`, late, () => onReminder(reminder))) : empty('No incomplete reminder occurrences today.')}
        {heading('Overdue reminders')}
        {overdue.length ? overdue.map(({reminder, date}) => row(reminder.id, reminder.title, `${formatDate(date)} ${formatTime(date)} · Overdue · Open reminder`, true, () => onReminder(reminder))) : empty('No overdue reminders.')}
        {heading('Upcoming alarms')}
        <Text style={{ color: theme.muted }}>Next occurrence per enabled alarm, from saved settings. These times do not verify Android permissions or delivery.</Text>
        {upcoming.map(({alarm, date}) => row(alarm.id, alarm.title || 'Alarm', `${formatDate(date!)} ${formatTime(date!)} · Open alarm`, false, () => onAlarm(alarm)))}
        {unknown.map(({alarm, reason}) => row(alarm.id, alarm.title || 'Alarm', `${reason} · Open alarm`, false, () => onAlarm(alarm)))}
        {!upcoming.length && !unknown.length && empty('No upcoming enabled alarms.')}
        {heading('Tasks due today')}
        {tasks.length ? tasks.map(task => row(task.id, task.title, `${task.dueTime || 'Any time today'}${taskOverdue(task,now) ? ' · Overdue' : ''} · Open Tasks`, taskOverdue(task,now), onTasks)) : empty('No incomplete tasks due today.')}
        {!!overdueTasks.filter(task => !tasks.includes(task)).length && <>
          {heading('Earlier overdue tasks')}
          {overdueTasks.filter(task => !tasks.includes(task)).map(task => row(task.id, task.title, `${task.dueDate} ${task.dueTime || ''} · Overdue · Open Tasks`, true, onTasks))}
        </>}
        {!!snapshot.skippedCount && <Text style={{ color: theme.error }}>Some saved tasks could not be displayed. Review Tasks; saved records were not changed.</Text>}
        <Text style={[styles.empty, { color: theme.muted }]}>Read-only overview. Repeating reminders show the latest uncleared overdue occurrence, not a history of every missed occurrence.</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  pageTitle: { fontSize: 26, fontWeight: '800' }, content: { padding: 20, gap: 12, paddingBottom: 32 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 12 }, row: { padding: 16, borderWidth: 1, borderRadius: 12, gap: 6, minHeight: 64 },
  title: { fontSize: 16, fontWeight: '700' }, empty: { lineHeight: 21, paddingVertical: 8 },
});
