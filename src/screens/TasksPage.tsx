import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Task, TaskFilter, TaskInput, TaskSort, selectTasks } from "../models/task";
import { taskStore } from "../services/taskStorage";
import { TaskConflictError, TaskNotFoundError } from "../services/taskStore";
import { useTasks } from "../hooks/useTasks";
import { TaskForm } from "../components/tasks/TaskForm";
import { TaskButton } from "../components/tasks/TaskButton";
import { taskStyles, taskTheme, TaskTheme } from "../components/tasks/taskTheme";

function dueLabel(task: Task) {
  const parts: string[] = [];
  if (task.dueDate) {
    const [year, month, day] = task.dueDate.split("-").map(Number);
    const date = new Date(); date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
    parts.push(date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }));
  } else parts.push("No due date");
  if (task.dueTime) {
    const [hour, minute] = task.dueTime.split(":").map(Number);
    const date = new Date(); date.setHours(hour, minute, 0, 0);
    parts.push(date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  }
  return parts.join(" · ");
}
const TaskCard = memo(function TaskCard({ task, theme, disabled, onComplete, onEdit, onDelete }: {
  task: Task; theme: TaskTheme; disabled: boolean; onComplete: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.taskRow}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.completed ? "Reopen" : "Complete"} task: ${task.title}`}
        accessibilityState={{ checked: task.completed, disabled }} disabled={disabled} onPress={() => onComplete(task)}
        style={[styles.checkTarget, disabled && taskStyles.disabled]}>
        <View style={[styles.checkbox, { borderColor: theme.accent, backgroundColor: task.completed ? theme.selected : theme.surface }]}>
          <Text style={{ color: theme.accent, fontWeight: "800" }}>{task.completed ? "✓" : ""}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit task: ${task.title}`} onPress={() => onEdit(task)} disabled={disabled} style={styles.taskCopy}>
        <Text style={[styles.taskTitle, { color: task.completed ? theme.muted : theme.text }, task.completed && styles.completedTitle]}>{task.title}</Text>
        {!!task.description && <Text style={[styles.description, { color: theme.muted }]} numberOfLines={2}>{task.description}</Text>}
        <Text style={[styles.metadata, { color: theme.muted }]}>{dueLabel(task)}</Text>
        <Text style={[styles.metadata, { color: task.priority === "high" ? theme.accent : theme.muted }]}>{task.priority === "none" ? "No priority" : `${task.priority[0].toUpperCase() + task.priority.slice(1)} priority`}</Text>
      </Pressable>
    </View>
    <View style={[taskStyles.row, styles.cardActions]}>
      <TaskButton label="Edit" theme={theme} accessibilityLabel={`Edit ${task.title}`} disabled={disabled} onPress={() => onEdit(task)} />
      <TaskButton label="Delete" theme={theme} accessibilityLabel={`Delete ${task.title}`} disabled={disabled} onPress={() => onDelete(task)} />
    </View>
  </View>;
});

export function TasksPage({ light, onBack }: { light: boolean; onBack: () => void }) {
  const theme = taskTheme(light);
  const { tasks, skippedCount, loading, error, refresh } = useTasks();
  const [filter, setFilter] = useState<TaskFilter>("active");
  const [sort, setSort] = useState<TaskSort>("dueDate");
  // undefined = closed; null = new task. Existing tasks retain their edit revision.
  const [editor, setEditor] = useState<Task | null | undefined>(undefined);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [refreshing, setRefreshing] = useState(false);
  const visible = useMemo(() => selectTasks(tasks, filter, sort), [tasks, filter, sort]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack]);
  const change = useCallback(async (task: Task, operation: () => Promise<unknown>) => {
    if (inFlight.current.has(task.id)) return;
    inFlight.current.add(task.id); setPending(new Set(inFlight.current));
    try { await operation(); }
    catch (failure) {
      const message = failure instanceof TaskConflictError || failure instanceof TaskNotFoundError ? failure.message : "Couldn’t update this task. Please try again.";
      Alert.alert("Task not updated", message);
    } finally {
      inFlight.current.delete(task.id); setPending(new Set(inFlight.current));
      void refresh().catch(() => undefined);
    }
  }, [refresh]);
  const complete = useCallback((task: Task) => { void change(task, () => taskStore.setCompleted(task.id, task.revision, !task.completed)); }, [change]);
  const edit = useCallback((task: Task) => setEditor(task), []);
  const remove = useCallback((task: Task) => {
    Alert.alert("Delete task?", `Permanently delete “${task.title}”?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void change(task, () => taskStore.remove(task.id, task.revision)); } },
    ]);
  }, [change]);
  async function save(input: TaskInput) {
    if (editor) await taskStore.update(editor.id, editor.revision, input);
    else await taskStore.create(input);
    // A refresh failure after a successful create must not invite duplicate saves.
    setEditor(undefined);
    void refresh().catch(() => undefined);
  }
  async function reloadEditor() {
    const latest = await refresh();
    const task = latest.tasks.find(item => item.id === editor?.id);
    if (!task) { setEditor(undefined); Alert.alert("Task unavailable", "This task was deleted or could not be loaded."); }
    else setEditor(task);
  }
  async function pullRefresh() {
    setRefreshing(true);
    try { await refresh(); } catch { /* useTasks displays the read error. */ }
    finally { setRefreshing(false); }
  }
  return <View style={[styles.screen, { backgroundColor: theme.background }]}>
    <FlatList data={error ? [] : visible} keyExtractor={item => item.id}
      contentContainerStyle={styles.list} refreshing={refreshing} onRefresh={() => void pullRefresh()}
      initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      renderItem={({ item }) => <TaskCard task={item} theme={theme} disabled={pending.has(item.id)} onComplete={complete} onEdit={edit} onDelete={remove} />}
      ListHeaderComponent={<View>
        <View style={[taskStyles.row, styles.pageHeader]}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Tasks</Text>
          <TaskButton label="New task" theme={theme} selected disabled={loading || !!error} onPress={() => setEditor(null)} />
        </View>
        <Text style={[styles.summary, { color: theme.muted }]}>{tasks.filter(task => !task.completed).length} active · {tasks.filter(task => task.completed).length} completed</Text>
        <View style={taskStyles.row}>{(["active", "completed", "all"] as TaskFilter[]).map(value => <TaskButton key={value} label={value[0].toUpperCase() + value.slice(1)}
          accessibilityLabel={`Show ${value} tasks`} theme={theme} selected={filter === value} onPress={() => setFilter(value)} />)}</View>
        <Text style={[taskStyles.label, { color: theme.muted }]}>SORT BY</Text>
        <View style={[taskStyles.row, styles.sort]}>
          <TaskButton label="Due date" accessibilityLabel="Sort tasks by due date" theme={theme} selected={sort === "dueDate"} onPress={() => setSort("dueDate")} />
          <TaskButton label="Priority" accessibilityLabel="Sort tasks by priority" theme={theme} selected={sort === "priority"} onPress={() => setSort("priority")} />
        </View>
        {!!skippedCount && !error && <Text accessibilityRole="alert" style={[taskStyles.body, styles.notice, { color: theme.muted }]}>Some tasks couldn’t be loaded. They remain saved on this device.</Text>}
        {!!error && <View style={styles.notice}>
          <Text accessibilityRole="alert" style={[taskStyles.body, { color: theme.error }]}>{error}</Text>
          <TaskButton label="Retry" theme={theme} onPress={() => void pullRefresh()} />
        </View>}
      </View>}
      ListEmptyComponent={!error ? <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.taskTitle, { color: theme.text }]}>{loading ? "Loading tasks…" : filter === "completed" ? "No completed tasks" : filter === "active" ? "No active tasks" : "No tasks yet"}</Text>
        {!loading && <Text style={[taskStyles.body, { color: theme.muted }]}>{filter === "completed" ? "Completed tasks stay saved here and can be reopened." : "Add a task with or without a due date."}</Text>}
      </View> : null} />
    {editor !== undefined && <TaskForm key={editor ? `${editor.id}:${editor.revision}` : "new"} task={editor ?? undefined} light={light} onSave={save} onCancel={() => setEditor(undefined)} onReload={reloadEditor} />}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  pageHeader: { justifyContent: "space-between" }, heading: { fontSize: 30, fontWeight: "800" },
  summary: { fontSize: 13, marginTop: 6, marginBottom: 14 }, sort: { marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 10 },
  taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  checkTarget: { minHeight: 48, width: 48, alignItems: "center", justifyContent: "center" },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  taskCopy: { flex: 1, minHeight: 48, paddingVertical: 4 }, taskTitle: { fontSize: 16, fontWeight: "700", lineHeight: 23 },
  completedTitle: { textDecorationLine: "line-through" }, description: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  metadata: { fontSize: 12, lineHeight: 18, marginTop: 4 }, cardActions: { justifyContent: "flex-end", marginTop: 8 },
  empty: { borderWidth: 1, borderRadius: 14, padding: 20, gap: 8 }, notice: { marginBottom: 16, gap: 10 },
});
