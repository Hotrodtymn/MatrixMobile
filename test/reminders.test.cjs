const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function harness(storage = new Map()) {
  const scheduled = new Map();
  const notificationCalls = {schedule:0,cancel:0};
  const notifications = {
    setNotificationHandler() {}, DEFAULT_ACTION_IDENTIFIER: 'default',
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' },
    async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
    async cancelScheduledNotificationAsync(id) { notificationCalls.cancel++; scheduled.delete(id); },
    async dismissNotificationAsync() {},
    async scheduleNotificationAsync(value) { notificationCalls.schedule++; const id = value.identifier || `id-${scheduled.size}`; scheduled.set(id, { ...value, identifier: id }); return id; },
  };
  const asyncStorage = { async getItem(key) { return storage.get(key) ?? null; }, async setItem(key, value) { storage.set(key, value); }, async multiSet(items) { items.forEach(([k,v]) => storage.set(k,v)); } };
  const widgetEvents = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/widgetDataEvents.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:widgetEvents,Set,Promise});
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/services/reminders.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Date, Set, Promise, console, require(name) { if(name === './widgetDataEvents') return widgetEvents; return name === 'expo-notifications' ? notifications : name === 'react-native' ? { Platform: { OS: 'android' } } : { default: asyncStorage, __esModule: true }; } });
  const read = () => JSON.parse(storage.get('matrix.reminders.v1'));
  return { api: exports, storage, scheduled, read, asyncStorage, notificationCalls, widgetEvents };
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
test('editor commit schedules and persists once for a stable reminder ID', async () => {
 const h = harness();
 const draft = futureDraft('stable-reminder');
 await h.api.commitReminder(draft, { base: [], notificationsEnabled: true });
 await h.api.commitReminder(draft, { base: [], notificationsEnabled: true });
 assert.equal(h.read().length, 1); assert.equal(h.scheduled.size, 1);
 assert.equal(h.read()[0].title, 'Call Mom'); assert.ok(h.read()[0].notificationId);
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

test('reminder list CRUD validates names, keeps stable IDs and never touches schedules', async () => {
 const h=harness();
 assert.equal((await h.api.readReminderLists()).length,0);
 assert.equal(h.storage.size,0);
 await Promise.all([h.api.createReminderList(' Work '),h.api.createReminderList('Home')]);
 const list=(await h.api.readReminderLists()).find(list=>list.name==='Work');
 await assert.rejects(h.api.createReminderList('work'),/already exists/);
 await assert.rejects(h.api.createReminderList('  '),/between/);
 await assert.rejects(h.api.renameReminderList(list.id,'Home'),/already exists/);
 await h.api.renameReminderList(list.id,'Office');
 assert.equal((await h.api.readReminderLists()).find(item=>item.id===list.id).name,'Office');
 assert.equal(h.scheduled.size,0);
});
test('metadata-only changes preserve recurring alert IDs, snooze, completion and unknown fields', async () => {
 const record={...reminder,notificationIds:['a','b'],weekdays:[1,3],completedThrough:'2026-01-01T10:00:00Z',snoozedUntil:'2027-01-01T10:00:00Z',futureField:{keep:true}};
 const h=harness(new Map([['matrix.reminders.v1',JSON.stringify([record])],['matrix.notes.v1','notes'],['matrix.alarms.v1','alarms']]));
 await h.api.createReminderList('Medical'); const list=(await h.api.readReminderLists())[0];
 const result=await h.api.updateReminderMetadata('r','high',list.id);
 assert.deepEqual(JSON.parse(JSON.stringify(result[0])),{...record,priority:'high',listId:list.id});
 assert.equal(h.scheduled.size,0); assert.equal(h.storage.get('matrix.notes.v1'),'notes'); assert.equal(h.storage.get('matrix.alarms.v1'),'alarms');assert.deepEqual(h.notificationCalls,{schedule:0,cancel:0});
 await h.api.updateReminderMetadata('r','none'); assert.equal(h.read()[0].listId,undefined);
});
test('deleting a list retains reminders and recurrence and stale assignments cannot return', async () => {
 const h=harness(new Map([['matrix.reminders.v1',JSON.stringify([reminder])]]));
 await h.api.createReminderList('Calls');const list=(await h.api.readReminderLists())[0];
 await h.api.updateReminderMetadata('r','low',list.id);
 const before=h.read()[0];const result=await h.api.deleteReminderList(list.id);
 assert.equal(result.cleanupFailed,false);assert.equal(h.read().length,1);assert.equal(h.read()[0].listId,undefined);
 assert.equal(h.read()[0].date,before.date);assert.equal(h.read()[0].notificationId,before.notificationId);assert.equal(h.read()[0].priority,'low');assert.deepEqual(h.notificationCalls,{schedule:0,cancel:0});
 assert.equal((await h.api.readReminderLists()).length,0);
 await assert.rejects(h.api.updateReminderMetadata('r','high',list.id),/unavailable/);
 await assert.rejects(h.api.commitReminder({...futureDraft('stale'),listId:list.id},{notificationsEnabled:true,base:[]}),/unavailable/);
 assert.equal(h.scheduled.size,0);
});
test('interrupted list cleanup leaves a durable tombstone and supports safe retry', async () => {
 const h=harness(new Map([['matrix.reminders.v1',JSON.stringify([reminder])]]));
 await h.api.createReminderList('Work');const list=(await h.api.readReminderLists())[0];await h.api.updateReminderMetadata('r','high',list.id);
 const write=h.asyncStorage.setItem;
 h.asyncStorage.setItem=async(key,value)=>{if(key==='matrix.reminders.v1')throw Error('disk failure');return write(key,value);};
 const result=await h.api.deleteReminderList(list.id);assert.equal(result.cleanupFailed,true);assert.equal(h.read()[0].listId,list.id);
 assert.equal((await h.api.readReminderLists()).length,0); // orphan ID is now logically Unassigned
 h.asyncStorage.setItem=write;await h.api.deleteReminderList(list.id);assert.equal(h.read()[0].listId,undefined);
});
test('legacy reads are non-destructive and malformed/future list documents cannot be overwritten', async () => {
 const raw=JSON.stringify([reminder]);const h=harness(new Map([['matrix.reminders.v1',raw]]));
 await h.api.readReminderLists();assert.equal(h.storage.get('matrix.reminders.v1'),raw);assert.equal(h.storage.has('matrix.reminder-lists.v1'),false);
 for(const doc of ['not-json','{"schemaVersion":2,"lists":[]}','{"schemaVersion":1,"lists":[null]}']) {
  h.storage.set('matrix.reminder-lists.v1',doc);await assert.rejects(h.api.createReminderList('New'));assert.equal(h.storage.get('matrix.reminder-lists.v1'),doc);assert.equal(h.storage.get('matrix.reminders.v1'),raw);
 }
});
test('list writes preserve catalog future fields and failed metadata writes do not corrupt reminders', async () => {
 const h=harness(new Map([['matrix.reminder-lists.v1',JSON.stringify({schemaVersion:1,future:'keep',lists:[{id:'list-a',name:'A',color:'keep'}]})],['matrix.reminders.v1',JSON.stringify([reminder])]]));
 await h.api.renameReminderList('list-a','Renamed');const catalog=JSON.parse(h.storage.get('matrix.reminder-lists.v1'));assert.equal(catalog.future,'keep');assert.equal(catalog.lists[0].color,'keep');
 const before=h.storage.get('matrix.reminders.v1');h.asyncStorage.setItem=async()=>{throw Error('disk');};
 await assert.rejects(h.api.updateReminderMetadata('r','high','list-a'),/disk/);assert.equal(h.storage.get('matrix.reminders.v1'),before);
});
test('notification completion and stale UI metadata preserve additive fields and recurring schedules', async () => {
 const record={...reminder,priority:'high',listId:'list-a'};const h=harness(new Map([['matrix.reminders.v1',JSON.stringify([record])]]));
 await h.api.handleNotificationResponse(response('MARK_COMPLETED'));assert.equal(h.read()[0].priority,'high');assert.equal(h.read()[0].listId,'list-a');assert.equal(h.read()[0].completed,false);assert.equal(h.read()[0].notificationId,record.notificationId);
 await h.api.updateReminderMetadata('r','medium');assert.ok(h.read()[0].completedThrough);assert.equal(h.read()[0].recurrence,'daily');assert.equal(h.scheduled.size,0);
});

test('widget observer sees persisted notification action state and cannot change its result',async()=>{
 const h=harness(new Map([['matrix.reminders.v1',JSON.stringify([reminder])]]));
 const snapshots=[];h.widgetEvents.subscribeWidgetData(()=>{snapshots.push(h.read());});
 h.widgetEvents.subscribeWidgetData(()=>{throw Error('widget unavailable');});
 await h.api.handleNotificationResponse(response('MARK_COMPLETED'));
 assert.equal(snapshots.length,1);assert.ok(snapshots[0][0].completedThrough);assert.equal(h.notificationCalls.schedule,0);
 let calls=0;h.widgetEvents.subscribeWidgetData(()=>calls++);
 await assert.rejects(h.api.serializeReminderMutation(async()=>{throw Error('save failed');}));assert.equal(calls,0);
});
