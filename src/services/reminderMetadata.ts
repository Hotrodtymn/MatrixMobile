export type ReminderPriority = 'none' | 'low' | 'medium' | 'high';
export interface ReminderList { id: string; name: string; deleted?: boolean; [key: string]: unknown }
export const REMINDER_PRIORITIES: ReminderPriority[] = ['none','low','medium','high'];
export function reminderPriority(item: { priority?: unknown }): ReminderPriority {
  return REMINDER_PRIORITIES.includes(item.priority as ReminderPriority) ? item.priority as ReminderPriority : 'none';
}
export function reminderListId(item: { listId?: unknown }, lists: readonly ReminderList[]): string | undefined {
  return typeof item.listId === 'string' && lists.some(list => list.id === item.listId && !list.deleted) ? item.listId : undefined;
}
export function compareReminderPriority(a: { priority?: unknown }, b: { priority?: unknown }): number {
  const rank = { high: 0, medium: 1, low: 2, none: 3 };
  return rank[reminderPriority(a)]-rank[reminderPriority(b)];
}
export type ReminderFilters = { list: string; priority: 'all' | ReminderPriority; status: 'all' | 'active' | 'completed' };
export function matchesReminderFilters(item: {priority?: unknown; listId?: unknown; completed?: boolean}, lists: readonly ReminderList[], filters: ReminderFilters): boolean {
  if (filters.status === 'active' && item.completed || filters.status === 'completed' && !item.completed) return false;
  if (filters.priority !== 'all' && reminderPriority(item) !== filters.priority) return false;
  const listId = reminderListId(item, lists);
  return filters.list === 'all' || (filters.list === 'unassigned' ? !listId : listId === filters.list);
}
