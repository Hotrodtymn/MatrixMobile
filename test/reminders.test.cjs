const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function harness(storage = new Map()) {
  const scheduled = new Map();
  const notifications = {
    setNotificationHandler() {}, DEFAULT_ACTION_IDENTIFIER: 'default',
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' },
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
    async dismissNotificationAsync() {},
    async scheduleNotificationAsync(value) { const id = value.identifier || `id-${scheduled.size}`; scheduled.set(id, { ...value, identifier: id }); return id; },
  };
  const asyncStorage = { async getItem(key) { return storage.get(key) ?? null; }, async setItem(key, value) { storage.set(key, value); }, async multiSet(items) { items.forEach(([k,v]) => storage.set(k,v)); } };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/services/reminders.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Date, Set, Promise, console, require(name) { return name === 'expo-notifications' ? notifications : name === 'react-native' ? { Platform: { OS: 'android' } } : { default: asyncStorage, __esModule: true }; } });
  const read = () => JSON.parse(storage.get('matrix.reminders.v1'));
  return { api: exports, storage, scheduled, read, asyncStorage };
}
const reminder = { id: 'r', title: 'Medication', description: 'After dinner', notificationId: 'daily-r', date: new Date().toISOString(), recurrence: 'daily' };
const response = action => ({ actionIdentifier: action, notification: { date: 1234, request: { identifier: 'daily-r', content: { data: { reminderId: 'r' } } } } });
test('recurring completion preserves schedule and records occurrence', async () => {
 const h = harness(new Map([['matrix.reminders.v1', JSON.stringify([reminder])]]));
 h.scheduled.set('daily-r', { identifier: 'daily-r', content: { data: { reminderId: 'r' } } });
 await h.api.handleNotificationResponse(response('MARK_COMPLETED'));
 assert.equal(h.read()[0].completed, false); assert.ok(h.read()[0].completedThrough); assert.equal(h.scheduled.size, 1);
});
test('snooze deduplicates concurrent and restarted processing; delete cancels all', async () => {
 const h = harness(new Map([['matrix.reminders.v1', JSON.stringify([reminder])]]));
 await Promise.all([h.api.handleNotificationResponse(response('SNOOZE_5')), h.api.handleNotificationResponse(response('SNOOZE_5'))]);
 assert.equal(h.scheduled.size, 1); assert.equal(h.read().length, 1);
 assert.equal([...h.scheduled.values()][0].content.title, 'Medication');
 assert.equal([...h.scheduled.values()][0].content.body, 'After dinner');
 const restarted = harness(h.storage); await restarted.api.handleNotificationResponse(response('SNOOZE_5')); assert.equal(restarted.scheduled.size, 0);
 await h.api.handleNotificationResponse(response('DELETE')); assert.equal(h.read().length, 0); assert.equal(h.scheduled.size, 0);
});
test('one-time completion persists without deleting record', async () => {
 const h = harness(new Map([['matrix.reminders.v1', JSON.stringify([{ ...reminder, recurrence: 'once' }])]]));
 await h.api.handleNotificationResponse(response('MARK_COMPLETED')); assert.equal(h.read()[0].completed, true);
});
test('selected weekdays use Sunday-based Expo triggers and cancel every request', async () => {
 const h = harness();
 const selected = { ...reminder, recurrence: 'selectedDays', weekdays: [2,4,2] };
 const ids = await h.api.scheduleReminder(selected);
 assert.equal(ids.length, 2);
 assert.deepEqual([...h.scheduled.values()].map(item => item.trigger.weekday).sort(), [3,5]);
 assert.ok([...h.scheduled.values()].every(item => item.trigger.type === 'weekly'));
 await h.api.cancelReminderNotifications('r', ids[0]); assert.equal(h.scheduled.size, 0);
});
test('next selected occurrence crosses week boundary in local time', () => {
 const h = harness();
 const base = new Date(2026,10,2,7,0); // Monday
 const next = h.api.getTaskDate({ ...reminder, date: base.toISOString(), recurrence: 'selectedDays', weekdays: [1,3,5] }, new Date(2026,10,6,8,0));
 assert.equal(next.getDay(), 1); assert.equal(next.getDate(), 9); assert.equal(next.getHours(), 7);
});
test('Home clears only completed occurrence and shows next selected day', () => {
 const h = harness();
 const item = { ...reminder, date: new Date(2026,10,2,7).toISOString(), recurrence: 'selectedDays', weekdays: [1,3], completedThrough: new Date(2026,10,2,8).toISOString() };
 assert.equal(h.api.homeReminderVisible(item, new Date(2026,10,2,9)), false);
 assert.equal(h.api.homeReminderVisible(item, new Date(2026,10,4,6)), true);
 assert.equal(h.api.homeReminderVisible({ ...item, completed: true }, new Date(2026,10,4,6)), false);
});
test('Home hides expired alarm but preserves its next-day visibility', () => {
 const h = harness(); const alarm = { id: 'a', hour: 7, minute: 0, enabled: true, sound: 'default' };
 assert.equal(h.api.homeAlarmVisible(alarm, new Date(2026,10,2,8)), false);
 assert.equal(h.api.homeAlarmVisible(alarm, new Date(2026,10,3,6)), true);
 assert.equal(h.api.homeAlarmVisible({ ...alarm, weekdays: [], scheduledFor: new Date(2026,10,2,7).toISOString() }, new Date(2026,10,3,6)), false);
});
test('a stale UI save preserves action completion and cannot resurrect deletion', () => {
 const h = harness();
 const latest = [{ ...reminder, completed: true }];
 const merged = h.api.mergeReminderChanges([reminder], [{ ...reminder, starred: true }], latest);
 assert.equal(merged[0].completed, true); assert.equal(merged[0].starred, true);
 assert.equal(h.api.mergeReminderChanges([reminder], [{ ...reminder, starred: true }], []).length, 0);
});
test('editing cancellation keeps all replacement weekday requests', async () => {
 const h = harness();
 h.scheduled.set('old', { identifier: 'old', content: { data: { reminderId: 'r' } } });
 const ids = await h.api.scheduleReminder({ ...reminder, recurrence: 'selectedDays', weekdays: [1,3,5] });
 await h.api.cancelReminderNotifications('r', 'old', ids);
 assert.equal(h.scheduled.size, 3); assert.equal(h.scheduled.has('old'), false);
});
test('Android headless dataString payload resolves the associated reminder', async () => {
 const h = harness(new Map([['matrix.reminders.v1', JSON.stringify([{ ...reminder, recurrence: 'once' }])]]));
 const raw = response('MARK_COMPLETED');
 raw.notification.request.content = { dataString: JSON.stringify({ reminderId: 'r' }) };
 await h.api.handleNotificationResponse(raw); assert.equal(h.read()[0].completed, true);
});
test('legacy pending notification text is replaced under the same identifier', async () => {
 const h = harness();
 h.scheduled.set('daily-r', { identifier: 'daily-r', content: { title: 'Matrix Reminder', data: { reminderId: 'r' } } });
 await h.api.refreshLegacyNotificationText([reminder]);
 assert.equal(h.scheduled.size, 1); assert.equal(h.scheduled.get('daily-r').content.title, 'Medication');
 assert.equal(h.scheduled.get('daily-r').content.body, 'After dinner');
});
test('legacy defaults and unrelated stored data survive actions', async () => {
 const oldReminder = { id: 'r', title: 'Legacy', date: new Date().toISOString(), notificationId: 'daily-r' };
 const storage = new Map([['matrix.reminders.v1', JSON.stringify([oldReminder])], ['matrix.notes.v1', '[{"id":"note","body":"Keep this"}]'], ['matrix.alarms.v1', '[{"id":"alarm"}]'], ['matrix.settings.v1', '{"theme":"dark"}']]);
 const h = harness(storage);
 assert.equal(h.api.getRecurrence(oldReminder), 'once');
 await h.api.handleNotificationResponse(response('MARK_COMPLETED'));
 assert.equal(h.read()[0].completed, true);
 assert.equal(storage.get('matrix.notes.v1'), '[{"id":"note","body":"Keep this"}]');
 assert.equal(storage.get('matrix.alarms.v1'), '[{"id":"alarm"}]');
 assert.equal(storage.get('matrix.settings.v1'), '{"theme":"dark"}');
 assert.equal(h.api.reminderContent(oldReminder).body, undefined);
});

const futureDraft = id => ({ id, title: 'Call Mom', date: new Date(Date.now()+86400000).toISOString(), notificationId: '', recurrence: 'once' });
test('shared manual/voice commit schedules and persists once for a stable confirmed session', async () => {
 const h = harness();
 const draft = futureDraft('voice-session');
 await h.api.commitReminder(draft, { base: [], notificationsEnabled: true, authorized: async () => true });
 await h.api.commitReminder(draft, { base: [], notificationsEnabled: true, authorized: async () => true });
 assert.equal(h.read().length, 1); assert.equal(h.scheduled.size, 1);
 assert.equal(h.read()[0].title, 'Call Mom'); assert.ok(h.read()[0].notificationId);
});
test('revoked confirmation after scheduling rolls back alerts and writes nothing', async () => {
 const h = harness(); let checks = 0;
 await assert.rejects(h.api.commitReminder(futureDraft('cancelled'), { base: [], notificationsEnabled: true, authorized: async () => ++checks === 1 }), /cancelled/);
 assert.equal(h.scheduled.size, 0); assert.equal(h.storage.has('matrix.reminders.v1'), false);
});
test('shared commit preserves unrelated reminders, notes and alarms and edits without duplicate alerts', async () => {
 const h = harness(new Map([['matrix.reminders.v1', JSON.stringify([reminder])], ['matrix.notes.v1','keep-notes'], ['matrix.alarms.v1','keep-alarms']]));
 const a = await h.api.commitReminder(futureDraft('new'), { base: [reminder], notificationsEnabled: true });
 assert.equal(a.records.length, 2);
 await h.api.commitReminder({ ...a.records[0], title: 'Updated title' }, { base: a.records, notificationsEnabled: true });
 assert.equal(h.scheduled.size,1); assert.equal(h.read().length,2); assert.equal(h.read()[0].title,'Updated title');
 assert.equal(h.storage.get('matrix.notes.v1'),'keep-notes'); assert.equal(h.storage.get('matrix.alarms.v1'),'keep-alarms');
});
test('invalid or already deleted reminder cannot be scheduled through the shared path', async () => {
 const h = harness();
 await assert.rejects(h.api.commitReminder({ ...futureDraft('bad'), date:'invalid' }, { base: [], notificationsEnabled:true }), /future time/);
 const draft = futureDraft('deleted');
 await assert.rejects(h.api.commitReminder(draft, { base: [draft], notificationsEnabled:true }), /deleted/);
 assert.equal(h.scheduled.size,0);
});
test('persistence failure rolls back scheduled reminders and queue remains usable', async () => {
 const h = harness(new Map([['matrix.reminders.v1', '[]']]));
 const write = h.asyncStorage.setItem;
 h.asyncStorage.setItem = async () => { throw Error('disk write failed'); };
 await assert.rejects(h.api.commitReminder(futureDraft('bad'), { base:[], notificationsEnabled:true }), /disk write failed/);
 assert.equal(h.scheduled.size,0); assert.equal(h.storage.get('matrix.reminders.v1'),'[]');
 h.asyncStorage.setItem = write;
 await h.api.commitReminder(futureDraft('good'), { base:[], notificationsEnabled:false });
 assert.equal(h.read().length,1); assert.equal(h.scheduled.size,0);
});
