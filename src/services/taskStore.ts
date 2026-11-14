import { normalizeTaskFields, normalizeTaskPatch, readTask, Task, TaskInput, TaskPatch } from "../models/task";

export const TASKS_KEY = "matrix.tasks.v1";
export class TaskStorageError extends Error {}
export class TaskConflictError extends Error {
  constructor() { super("This task changed since you opened it. Reload it before saving."); }
}
export class TaskNotFoundError extends Error {
  constructor() { super("This task was deleted or could not be loaded."); }
}
export interface TaskStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export interface TaskSnapshot { tasks: Task[]; skippedCount: number }
interface Document {
  schemaVersion: 1;
  tasks: unknown[];
  [key: string]: unknown;
}
// All instances in this JS runtime share the queue. Each operation reads fresh data.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
let idSequence = 0;
export function createTaskStore(storage: TaskStorage, options: { now?: () => number; id?: () => string } = {}) {
  const now = options.now ?? Date.now;
  const nextId = options.id ?? (() => `task-${Date.now().toString(36)}-${(++idSequence).toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  const listeners = new Set<() => void>();
  async function read() {
    const stored = await storage.getItem(TASKS_KEY);
    let document: Document;
    if (stored === null) document = { schemaVersion: 1, tasks: [] };
    else {
      let value: unknown;
      try { value = JSON.parse(stored); } catch { throw new TaskStorageError("Saved tasks could not be read. Your data has not been changed."); }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new TaskStorageError("Saved tasks could not be read. Your data has not been changed.");
      const raw = value as Record<string, unknown>;
      if (raw.schemaVersion !== 1 || !Array.isArray(raw.tasks)) throw new TaskStorageError("This task format is not supported. Your data has not been changed.");
      document = raw as Document;
    }
    const parsed = document.tasks.map(readTask);
    const counts = new Map<string, number>();
    for (const task of parsed) if (task) counts.set(task.id, (counts.get(task.id) ?? 0) + 1);
    // Duplicate IDs are ambiguous: keep both raw records, expose neither for editing.
    const indexed = parsed.flatMap((task, index) => task && counts.get(task.id) === 1 ? [{ task, index }] : []);
    return { document, indexed, snapshot: { tasks: indexed.map(item => item.task), skippedCount: parsed.length - indexed.length } };
  }
  async function write(document: Document) {
    await storage.setItem(TASKS_KEY, JSON.stringify(document));
    for (const listener of listeners) {
      try { listener(); } catch { /* A UI subscriber must not invalidate a successful save. */ }
    }
  }
  function modified(task: Task): string {
    return new Date(Math.max(now(), Date.parse(task.updatedAt) + 1)).toISOString();
  }
  function mutate(id: string, revision: number, change: (task: Task) => Task | null): Promise<Task | null> {
    return serialize(async () => {
      const { document, indexed } = await read();
      const found = indexed.find(item => item.task.id === id);
      if (!found) throw new TaskNotFoundError();
      if (found.task.revision !== revision) throw new TaskConflictError();
      const updated = change(found.task);
      if (updated === found.task) return updated;
      const entries = [...document.tasks];
      if (updated) entries[found.index] = updated;
      else entries.splice(found.index, 1);
      await write({ ...document, tasks: entries });
      return updated;
    });
  }
  return {
    list(): Promise<TaskSnapshot> { return serialize(async () => (await read()).snapshot); },
    create(input: TaskInput): Promise<Task> {
      return serialize(async () => {
        const fields = normalizeTaskFields(input);
        const { document } = await read();
        let id = nextId();
        const exists = (candidate: string) => document.tasks.some(item => item && typeof item === "object" && (item as Record<string, unknown>).id === candidate);
        for (let tries = 0; exists(id) && tries < 8; tries++) id = nextId();
        if (!id.trim() || exists(id)) throw new TaskStorageError("Could not create a unique task. Try again.");
        const timestamp = new Date(now()).toISOString();
        const task: Task = { ...fields, id, completed: false, createdAt: timestamp, updatedAt: timestamp, completedAt: null, revision: 1 };
        await write({ ...document, tasks: [...document.tasks, task] });
        return task;
      });
    },
    update(id: string, revision: number, patch: TaskPatch): Promise<Task | null> {
      return mutate(id, revision, task => ({ ...task, ...normalizeTaskFields({ ...task, ...normalizeTaskPatch(patch) }), updatedAt: modified(task), revision: task.revision + 1 }));
    },
    setCompleted(id: string, revision: number, completed: boolean): Promise<Task | null> {
      return mutate(id, revision, task => {
        if (typeof completed !== "boolean") throw new TaskStorageError("Choose a valid completion status.");
        if (task.completed === completed) return task;
        const updatedAt = modified(task);
        return { ...task, completed, completedAt: completed ? updatedAt : null, updatedAt, revision: task.revision + 1 };
      });
    },
    remove(id: string, revision: number): Promise<Task | null> { return mutate(id, revision, () => null); },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
export type TaskStore = ReturnType<typeof createTaskStore>;
