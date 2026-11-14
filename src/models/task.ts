export const TASK_PRIORITIES = ["high", "medium", "low", "none"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskSort = "dueDate" | "priority";
export type TaskFilter = "all" | "active" | "completed";

export interface TaskFields {
  title: string;
  description: string;
  /** Local calendar date, YYYY-MM-DD; deliberately not a UTC timestamp. */
  dueDate: string | null;
  /** Local wall-clock time, HH:mm. Valid independently of dueDate. */
  dueTime: string | null;
  priority: TaskPriority;
}
export interface Task extends TaskFields {
  id: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Optimistic concurrency token; independent of wall-clock changes. */
  revision: number;
}
export type TaskInput = Pick<TaskFields, "title"> & Partial<Omit<TaskFields, "title">>;
export type TaskPatch = Partial<TaskFields>;
export class TaskValidationError extends Error {}

export function validTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function validTaskTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function normalizeTaskFields(input: TaskInput): TaskFields {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TaskValidationError("Enter valid task details.");
  if (typeof input.title !== "string" || !input.title.trim()) throw new TaskValidationError("Enter a task name.");
  if (input.title.trim().length > 150) throw new TaskValidationError("Keep the task name within 150 characters.");
  if (input.description !== undefined && typeof input.description !== "string") throw new TaskValidationError("Enter a valid description.");
  if ((input.description?.length ?? 0) > 2000) throw new TaskValidationError("Keep the description within 2,000 characters.");
  if (input.dueDate != null && !validTaskDate(input.dueDate)) throw new TaskValidationError("Choose a valid due date.");
  if (input.dueTime != null && !validTaskTime(input.dueTime)) throw new TaskValidationError("Choose a valid due time.");
  if (input.priority !== undefined && !TASK_PRIORITIES.includes(input.priority)) throw new TaskValidationError("Choose a valid priority.");
  return { title: input.title.trim(), description: input.description?.trim() ?? "", dueDate: input.dueDate ?? null, dueTime: input.dueTime ?? null, priority: input.priority ?? "none" };
}
export function normalizeTaskPatch(patch: TaskPatch): TaskPatch {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TaskValidationError("Enter valid task changes.");
  const allowed = ["title", "description", "dueDate", "dueTime", "priority"];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw new TaskValidationError("Unsupported task field.");
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
/** Invalid records are left untouched in storage rather than silently repaired/deleted. */
export function readTask(value: unknown): Task | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  try {
    if (typeof raw.id !== "string" || !raw.id.trim() || !timestamp(raw.createdAt)) return null;
    if (raw.completed !== undefined && typeof raw.completed !== "boolean") return null;
    const completed = raw.completed ?? false;
    const updatedAt = raw.updatedAt ?? raw.createdAt;
    if (!timestamp(updatedAt) || Date.parse(updatedAt) < Date.parse(raw.createdAt)) return null;
    const completedAt = completed ? (raw.completedAt ?? updatedAt) : null;
    if (completedAt !== null && !timestamp(completedAt)) return null;
    const revision = raw.revision ?? 1;
    if (!Number.isSafeInteger(revision) || (revision as number) < 1) return null;
    // Spread preserves fields introduced by later versions (projects, etc.).
    return { ...raw, ...normalizeTaskFields(raw as unknown as TaskInput), id: raw.id, completed: completed as boolean, createdAt: raw.createdAt, updatedAt, completedAt, revision: revision as number };
  } catch { return null; }
}
const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };
export function selectTasks(tasks: readonly Task[], filter: TaskFilter, sort: TaskSort): Task[] {
  const compareDue = (a: Task, b: Task) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    // Date-only tasks follow timed tasks on the same day. Undated tasks sort last.
    return (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
  };
  return tasks.filter(task => filter === "all" || task.completed === (filter === "completed")).sort((a, b) => {
    const due = compareDue(a, b);
    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    return (sort === "priority" ? priority || due : due || priority)
      || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
}
