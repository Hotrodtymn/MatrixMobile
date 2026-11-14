const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Date, Math, Promise, Map, Set, console, require(name) { return load(path.resolve(path.dirname(file), name + '.ts')); } }, { filename: file });
  return exports;
}
const model = load('src/models/task.ts');
const { createTaskStore, TASKS_KEY, TaskConflictError, TaskNotFoundError, TaskStorageError } = load('src/services/taskStore.ts');
function harness(entries = new Map()) {
  let sequence = 0;
  let clock = Date.parse('2026-11-02T12:00:00Z');
  let failWrite = false;
  const storage = {
    async getItem(key) { await Promise.resolve(); return entries.get(key) ?? null; },
    async setItem(key, value) { await Promise.resolve(); if (failWrite) throw new Error('disk full'); entries.set(key, value); },
  };
  const options = { now: () => clock, id: () => `task-${++sequence}` };
  return { entries, storage, options, store: createTaskStore(storage, options), advance() { clock += 1000; }, fail(value) { failWrite = value; } };
}
const data = value => JSON.parse(JSON.stringify(value));
test('creates a separate persisted entity with timestamps and optional due fields', async () => {
  const h = harness(new Map([['matrix.notes.v1', 'notes'], ['matrix.reminders.v1', 'reminders'], ['matrix.alarms.v1', 'alarms'], ['matrix.settings.v1', 'settings']]));
  const task = await h.store.create({ title: '  Plan trip  ' });
  assert.equal(task.title, 'Plan trip'); assert.equal(task.completed, false); assert.equal(task.priority, 'none');
  assert.equal(task.dueDate, null); assert.equal(task.dueTime, null); assert.equal(task.description, '');
  assert.equal(task.createdAt, task.updatedAt); assert.equal(task.completedAt, null); assert.equal(task.revision, 1);
  assert.equal(JSON.parse(h.entries.get(TASKS_KEY)).schemaVersion, 1);
  const restarted = createTaskStore(h.storage, h.options);
  assert.deepEqual(data((await restarted.list()).tasks), data([task]));
  assert.equal(h.entries.get('matrix.notes.v1'), 'notes'); assert.equal(h.entries.get('matrix.reminders.v1'), 'reminders');
  assert.equal(h.entries.get('matrix.alarms.v1'), 'alarms'); assert.equal(h.entries.get('matrix.settings.v1'), 'settings');
});
test('edits only requested fields and preserves dates, creation and future fields', async () => {
  const h = harness(); const created = await h.store.create({ title: 'Draft', description: 'Keep', dueDate: '2026-12-01', dueTime: '08:15', priority: 'high' });
  const doc = JSON.parse(h.entries.get(TASKS_KEY)); doc.tasks[0].futureProjectId = 'project-1'; doc.futureMetadata = { preserve: true }; h.entries.set(TASKS_KEY, JSON.stringify(doc));
  h.advance(); const updated = await h.store.update(created.id, 1, { title: 'Final' });
  assert.equal(updated.description, 'Keep'); assert.equal(updated.dueDate, '2026-12-01'); assert.equal(updated.dueTime, '08:15');
  assert.equal(updated.priority, 'high'); assert.equal(updated.createdAt, created.createdAt); assert.ok(updated.updatedAt > created.updatedAt);
  assert.equal(updated.futureProjectId, 'project-1'); assert.equal(JSON.parse(h.entries.get(TASKS_KEY)).futureMetadata.preserve, true);
  const cleared = await h.store.update(created.id, updated.revision, { dueDate: null, dueTime: null });
  assert.equal(cleared.dueDate, null); assert.equal(cleared.dueTime, null);
});
test('completes, persists, filters and reopens without deleting', async () => {
  const h = harness(); const task = await h.store.create({ title: 'Finish' }); h.advance();
  const done = await h.store.setCompleted(task.id, task.revision, true);
  assert.equal(done.completed, true); assert.equal(done.completedAt, done.updatedAt);
  assert.equal((await h.store.list()).tasks.length, 1);
  assert.equal(model.selectTasks([done], 'active', 'dueDate').length, 0);
  assert.equal(model.selectTasks([done], 'completed', 'dueDate').length, 1);
  const reopened = await h.store.setCompleted(done.id, done.revision, false);
  assert.equal(reopened.completed, false); assert.equal(reopened.completedAt, null); assert.ok(reopened.updatedAt > done.updatedAt);
  assert.equal(model.selectTasks([reopened], 'all', 'priority').length, 1);
});
test('deletes only the selected task and cannot resurrect it with a stale edit', async () => {
  const h = harness(); const a = await h.store.create({ title: 'A' }); const b = await h.store.create({ title: 'B' });
  await h.store.remove(a.id, a.revision);
  await assert.rejects(h.store.update(a.id, a.revision, { title: 'Zombie' }), TaskNotFoundError);
  assert.deepEqual(data((await h.store.list()).tasks.map(t => t.id)), [b.id]);
});
test('sorts priority high through none with deterministic tie breaking', async () => {
  const h = harness(); const tasks = [];
  for (const priority of ['none', 'low', 'high', 'medium']) tasks.push(await h.store.create({ title: priority, priority }));
  assert.deepEqual(data(model.selectTasks(tasks, 'active', 'priority').map(t => t.priority)), ['high', 'medium', 'low', 'none']);
  assert.equal(tasks[0].priority, 'none'); // selector must not mutate source array
});
test('sorts local due dates, timed before all-day, and undated last', async () => {
  const h = harness(); const tasks = [];
  for (const input of [
    { title: 'Undated' }, { title: 'Later', dueDate: '2026-11-05' },
    { title: 'Date only', dueDate: '2026-11-03' }, { title: 'Morning', dueDate: '2026-11-03', dueTime: '08:00' },
    { title: 'Time only', dueTime: '09:00' }, { title: 'Afternoon', dueDate: '2026-11-03', dueTime: '15:30' },
  ]) tasks.push(await h.store.create(input));
  assert.deepEqual(data(model.selectTasks(tasks, 'all', 'dueDate').map(t => t.title)), ['Morning','Afternoon','Date only','Later','Time only','Undated']);
});
test('invalid titles, dates, times, priorities and protected fields do not write', async () => {
  const h = harness();
  for (const input of [{ title: '' }, { title: '   ' }, { title: 'a'.repeat(151) }, { title: 'x', dueDate: '2027-02-29' }, { title: 'x', dueDate: '2026-04-31' }, { title: 'x', dueTime: '24:00' }, { title: 'x', priority: 'urgent' }, { title: 'x', description: 5 }]) {
    await assert.rejects(h.store.create(input), model.TaskValidationError);
  }
  assert.equal(h.entries.has(TASKS_KEY), false);
  const task = await h.store.create({ title: 'Valid', dueDate: '2028-02-29' });
  const raw = h.entries.get(TASKS_KEY);
  await assert.rejects(h.store.update(task.id, task.revision, { completed: true }), model.TaskValidationError);
  assert.equal(h.entries.get(TASKS_KEY), raw);
});
test('serializes concurrent creates/edits across store instances without losing tasks', async () => {
  const h = harness(); const second = createTaskStore(h.storage, h.options);
  const [a,b] = await Promise.all([h.store.create({ title: 'A' }), second.create({ title: 'B' })]);
  await Promise.all([h.store.update(a.id, 1, { priority: 'high' }), second.update(b.id, 1, { description: 'B edited' })]);
  const tasks = (await h.store.list()).tasks;
  assert.equal(tasks.length, 2); assert.equal(tasks.find(t => t.id === a.id).priority, 'high'); assert.equal(tasks.find(t => t.id === b.id).description, 'B edited');
});
test('rejects stale edits, completions and deletions of a newer task', async () => {
  const h = harness(); const task = await h.store.create({ title: 'Original' });
  await h.store.update(task.id, task.revision, { title: 'Newer' });
  await assert.rejects(h.store.update(task.id, task.revision, { title: 'Stale' }), TaskConflictError);
  await assert.rejects(h.store.setCompleted(task.id, task.revision, true), TaskConflictError);
  await assert.rejects(h.store.remove(task.id, task.revision), TaskConflictError);
  assert.equal((await h.store.list()).tasks[0].title, 'Newer');
});
test('malformed records and duplicate IDs remain saved while valid tasks can change', async () => {
  const h = harness(); const good = await h.store.create({ title: 'Good' });
  const invalid = { id: 'bad', title: '' }; const duplicate = { ...good, id: 'duplicate' };
  const doc = { schemaVersion: 1, tasks: [good, invalid, null, duplicate, duplicate] }; h.entries.set(TASKS_KEY, JSON.stringify(doc));
  const result = await h.store.list(); assert.equal(result.tasks.length, 1); assert.equal(result.skippedCount, 4);
  await h.store.update(good.id, 1, { priority: 'low' });
  const after = JSON.parse(h.entries.get(TASKS_KEY)); assert.deepEqual(after.tasks.slice(1), doc.tasks.slice(1));
});
test('malformed whole documents and future schemas are never overwritten', async () => {
  for (const raw of ['not JSON', '[]', 'null', '{"schemaVersion":2,"tasks":[]}', '{"schemaVersion":1,"tasks":null}']) {
    const h = harness(new Map([[TASKS_KEY, raw]]));
    await assert.rejects(h.store.list(), TaskStorageError); await assert.rejects(h.store.create({ title: 'Safe' }), TaskStorageError);
    assert.equal(h.entries.get(TASKS_KEY), raw);
  }
});
test('failed storage writes preserve previous data and the queue recovers', async () => {
  const h = harness(); const task = await h.store.create({ title: 'Safe' }); const saved = h.entries.get(TASKS_KEY);
  h.fail(true); await assert.rejects(h.store.update(task.id, 1, { title: 'Lost' }), /disk full/);
  assert.equal(h.entries.get(TASKS_KEY), saved);
  h.fail(false); await h.store.update(task.id, 1, { title: 'Recovered' }); assert.equal((await h.store.list()).tasks[0].title, 'Recovered');
});
test('two concurrent saves of the same revision cannot overwrite one another', async () => {
  const h = harness(); const second = createTaskStore(h.storage, h.options);
  const task = await h.store.create({ title: 'Original' });
  const results = await Promise.allSettled([
    h.store.update(task.id, 1, { title: 'First edit' }),
    second.update(task.id, 1, { title: 'Stale second edit' }),
  ]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.ok(results[1].reason instanceof TaskConflictError);
  assert.equal((await h.store.list()).tasks[0].title, 'First edit');
});
test('missing optional record fields get safe defaults without rewriting storage', async () => {
  const raw = JSON.stringify({ schemaVersion: 1, tasks: [{ id: 'minimal', title: 'Minimal', createdAt: '2026-11-02T12:00:00Z' }] });
  const h = harness(new Map([[TASKS_KEY, raw]])); const task = (await h.store.list()).tasks[0];
  assert.equal(task.priority, 'none'); assert.equal(task.completed, false); assert.equal(task.dueDate, null);
  assert.equal(task.dueTime, null); assert.equal(task.updatedAt, task.createdAt); assert.equal(task.revision, 1);
  assert.equal(h.entries.get(TASKS_KEY), raw);
  await assert.rejects(h.store.create(null), model.TaskValidationError);
  await assert.rejects(h.store.update(task.id, task.revision, null), model.TaskValidationError);
  assert.equal(h.entries.get(TASKS_KEY), raw);
});
