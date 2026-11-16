const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/voiceCommand.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest, Date, Number });
const parse = exportsForTest.parseVoiceReminder;
const now = new Date(2026, 10, 16, 10, 0);
test('example preserves title and uses tomorrow in local time', () => {
  const { reminder } = parse('Remind me to call Mom tomorrow at 3 PM', now);
  assert.equal(reminder.title, 'call Mom'); assert.equal(reminder.date.getDate(), 17); assert.equal(reminder.date.getHours(), 15);
});
test('midnight, noon, minutes, 24-hour time, and year rollover', () => {
  for (const [time, hour, minute] of [['12 AM',0,0], ['12 PM',12,0], ['3:45 p.m.',15,45], ['23:10',23,10]]) {
    const r = parse(`Remind me to call tomorrow at ${time}`, now).reminder;
    assert.equal(r.date.getHours(), hour); assert.equal(r.date.getMinutes(), minute);
  }
  const r = parse('Remind me to call tomorrow at 3 PM', new Date(2026,11,31,10)).reminder;
  assert.equal(r.date.getFullYear(), 2027); assert.equal(r.date.getMonth(), 0); assert.equal(r.date.getDate(), 1);
});
test('rejects ambiguous, unsupported, missing and invalid commands', () => {
  for (const text of ['', 'call Mom', 'Remind me to call tomorrow', 'Remind me to call at 3 PM', 'Remind me to call tomorrow at 3', 'Remind me to call next Friday at 3 PM', 'Remind me to call tomorrow at 25:00', 'Remind me to call tomorrow at 13 PM', 'Remind me to call tomorrow at 3:99 PM', 'Remind me to call on 2027-02-29 at 3 PM', 'Remind me to call on 2026-13-01 at 3 PM', 'Remind me to call today at 9 AM', 'Remind me to call tomorrow at 3 PM every day']) assert.ok(parse(text, now).error, text);
});
test('accepts explicit valid calendar date; rejects oversized title', () => {
  const r = parse('Remind me to renew on 2028-02-29 at 15:00', now).reminder;
  assert.equal(r.date.getFullYear(), 2028); assert.equal(r.date.getMonth(), 1); assert.equal(r.date.getDate(), 29);
  assert.ok(parse(`Remind me to ${'x'.repeat(151)} tomorrow at 3 PM`, now).error);
});
