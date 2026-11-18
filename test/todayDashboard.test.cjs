const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {harness} = require('./dashboardHarness.cjs');
const api = harness().api;
const local = (y,m,d,h=0,min=0) => new Date(y,m-1,d,h,min);
const reminder = (date, recurrence='once', extra={}) => ({id:'r',title:'Call',date:date.toISOString(),recurrence,notificationId:'existing',...extra});
const alarm = extra => ({id:'a',hour:15,minute:0,enabled:true,sound:'default',...extra});

test('today and overdue once reminders respect completion, exact time and local midnight', () => {
 const now=local(2027,1,5,12), previous=reminder(local(2027,1,4,23,59)), due=reminder(local(2027,1,5,11)), later=reminder(local(2027,1,5,13));
 assert.equal(api.todayReminders([previous,due,later],now).length,2);
 assert.equal(api.overdueReminders([previous,due,later],now).length,2);
 assert.equal(api.todayReminders([{...due,completed:true}],now).length,0);
 assert.equal(api.overdueReminders([reminder(now)],now).length,0);
 assert.equal(api.todayReminders([reminder(local(2027,1,6))],local(2027,1,5,23,59)).length,0);
});
test('recurring occurrences reuse daily weekly monthly and selected-day definitions without mutations', () => {
 const now=local(2027,2,28,16);
 const inputs=[reminder(local(2027,1,1,15),'daily'),reminder(local(2027,2,21,15),'weekly'),reminder(local(2027,1,31,15),'monthly'),reminder(local(2027,1,1,15),'selectedDays',{weekdays:[now.getDay()]})];
 const before=JSON.stringify(inputs);
 assert.equal(api.todayReminders(inputs,now).length,4); // Existing Matrix monthly rule clamps to last day.
 assert.ok(api.todayReminders(inputs,now).every(row=>row.date.getDate()===28));
 assert.equal(JSON.stringify(inputs),before);
 assert.equal(api.todayReminders([reminder(local(2027,3,1,15),'daily')],now).length,0);
});
test('completion-through clears only earlier repeating occurrences; snooze delays overdue', () => {
 const now=local(2027,1,5,16), cleared=reminder(local(2027,1,1,15),'daily',{completedThrough:local(2027,1,4,15).toISOString()});
 assert.equal(api.todayReminders([cleared],now).length,1);
 assert.equal(api.overdueReminders([cleared],now).length,1);
 assert.equal(api.overdueReminders([{...cleared,completedThrough:local(2027,1,5,15).toISOString()}],now).length,0);
 assert.equal(api.overdueReminders([{...cleared,snoozedUntil:local(2027,1,6,10).toISOString()}],now).length,0);
 assert.equal(api.overdueReminders([cleared],local(2027,1,6,14)).length,1); // latest uncleared occurrence, not a backlog
});
test('weekly monthly and leap-year overdue search crosses day and year boundaries', () => {
 assert.equal(api.overdueReminders([reminder(local(2026,12,31,15),'weekly')],local(2027,1,1)).length,1);
 assert.equal(api.overdueReminders([reminder(local(2027,1,31,15),'monthly')],local(2027,3,1)).length,1);
 const leap=api.overdueReminders([reminder(local(2024,2,29,15),'yearly')],local(2027,1,1));
 assert.equal(leap.length,1); assert.equal(leap[0].date.getFullYear(),2024);
});
test('alarm display handles disabled, one-time timestamps and legacy/selected-day recurrence', () => {
 const now=local(2027,1,5,15);
 assert.equal(api.nextAlarm(alarm({enabled:false}),now).date,null);
 assert.equal(api.nextAlarm(alarm({weekdays:[],scheduledFor:local(2027,1,5,14).toISOString()}),now).date,null);
 assert.ok(api.nextAlarm(alarm({weekdays:[]}),now).reason);
 assert.equal(api.nextAlarm(alarm({weekdays:[],scheduledFor:local(2027,1,6,7).toISOString()}),now).date.getHours(),7);
 assert.equal(api.nextAlarm(alarm({}),now).date.getDate(),6); // strict future, legacy daily
 const next=api.nextAlarm(alarm({weekdays:[now.getDay()]}),now).date;
 assert.equal(next.getDate(),12);
 assert.ok(api.nextAlarm(alarm({weekdays:[8]}),now).reason);
 assert.ok(api.nextAlarm(alarm({hour:24}),now).reason);
});
test('tasks use existing local due dates, exclude completed/undated, and date-only deadlines end at day boundary', () => {
 const now=local(2027,1,5,12);
 const tasks=[{id:'early',dueDate:'2027-01-05',dueTime:'10:00',completed:false},{id:'allDay',dueDate:'2027-01-05',dueTime:null,completed:false},{id:'old',dueDate:'2027-01-04',completed:false},{id:'none',dueDate:null,completed:false},{id:'done',dueDate:'2027-01-05',completed:true}];
 assert.equal(api.todayTasks(tasks,now).length,2);
 assert.equal(api.taskOverdue(tasks[0],now),true); assert.equal(api.taskOverdue(tasks[1],now),false);
 assert.equal(api.taskOverdue(tasks[1],local(2027,1,6)),true);
 assert.equal(api.taskOverdue(tasks[3],now),false);
});
test('snapshot reads only existing keys and reports malformed/error data without writes', async () => {
 const h=harness({'matrix.reminders.v1':'[]','matrix.alarms.v1':'[]'});
 assert.equal((await h.snapshot.readDashboard()).reminders.length,0); assert.equal(h.writes.length,0);
 h.storage.set('matrix.reminders.v1','not-json'); await assert.rejects(h.snapshot.readDashboard());
 h.storage.set('matrix.reminders.v1','{}'); await assert.rejects(h.snapshot.readDashboard());
 h.storage.set('matrix.reminders.v1',JSON.stringify([{id:'broken',date:'invalid',title:'x'}])); await assert.rejects(h.snapshot.readDashboard());
 assert.equal(h.writes.length,0);
});
test('calendar selection is local across UTC offsets, DST, and half-hour time zones', () => {
 for (const tz of ['UTC','America/New_York','Asia/Kolkata','Pacific/Auckland']) {
  const result=JSON.parse(execFileSync(process.execPath,['-e',`
   const a=require('./test/dashboardHarness.cjs').harness().api;
   const now=new Date(2027,0,5,0,1);
   const r={id:'r',title:'x',notificationId:'',date:new Date(2027,0,4,23,59).toISOString()};
   const alarm={id:'a',enabled:true,hour:7,minute:0,sound:'default'};
   const next=a.nextAlarm(alarm,new Date(2027,0,5,23,59)).date;
   const dst=a.nextAlarm({...alarm,hour:2,minute:30},new Date(2027,2,14,0));
   console.log(JSON.stringify({key:a.localDayKey(now),today:a.todayReminders([r],now).length,overdue:a.overdueReminders([r],now).length,nextDay:next.getDate(),nextHour:next.getHours(),dstUnknown:!!dst.reason}));
  `],{env:{...process.env,TZ:tz},encoding:'utf8'}));
  assert.equal(result.key,'2027-01-05',tz); assert.equal(result.today,0,tz); assert.equal(result.overdue,1,tz); assert.equal(result.nextDay,6,tz); assert.equal(result.nextHour,7,tz);
  if(tz==='America/New_York') assert.equal(result.dstUnknown,true);
 }
});
