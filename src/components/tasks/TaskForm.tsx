import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { normalizeTaskFields, Task, TaskInput, TaskPriority, TASK_PRIORITIES, TaskValidationError } from "../../models/task";
import { TaskConflictError, TaskNotFoundError } from "../../services/taskStore";
import { TaskButton } from "./TaskButton";
import { taskStyles, taskTheme } from "./taskTheme";

export function TaskForm({ task, light, onSave, onCancel, onReload }: {
  task?: Task; light: boolean; onSave: (input: TaskInput) => Promise<void>; onCancel: () => void; onReload: () => Promise<void>;
}) {
  const theme = taskTheme(light);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState<string | null>(task?.dueDate ?? null);
  const [dueTime, setDueTime] = useState<string | null>(task?.dueTime ?? null);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "none");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [deleted, setDeleted] = useState(false);
  function close() { if (!pending.current) onCancel(); }
  async function save() {
    if (pending.current) return;
    pending.current = true; setSaving(true); setError(null); setConflict(false); setDeleted(false);
    try {
      const input = normalizeTaskFields({ title, description, dueDate, dueTime, priority });
      await onSave(input);
    } catch (failure) {
      if (failure instanceof TaskValidationError || failure instanceof TaskConflictError || failure instanceof TaskNotFoundError) {
        setError(failure.message); setConflict(failure instanceof TaskConflictError); setDeleted(failure instanceof TaskNotFoundError);
      } else setError("Couldn’t save this task. Your changes are still here; try again.");
    } finally { pending.current = false; setSaving(false); }
  }
  function chooseDue(mode: "date" | "time", value: Date) {
    if (mode === "date") setDueDate(`${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`);
    else setDueTime(`${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`);
  }
  const dateValue = new Date();
  dateValue.setHours(12, 0, 0, 0);
  if (dueDate) {
    const [year, month, day] = dueDate.split("-").map(Number);
    dateValue.setFullYear(year, month - 1, day);
  }
  const timeValue = new Date();
  if (dueTime) {
    const [hour, minute] = dueTime.split(":").map(Number);
    timeValue.setHours(hour, minute, 0, 0);
  }
  const displayDate = dueDate ? dateValue.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Add date";
  const displayTime = dueTime ? timeValue.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Add time";
  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}><Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{task ? "Edit task" : "New task"}</Text></View>
        <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}>
          <Text style={[taskStyles.label, { color: theme.accent }]}>TASK NAME</Text>
          <TextInput accessibilityLabel="Task name, required" style={[taskStyles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={title} onChangeText={setTitle} maxLength={150} editable={!saving} returnKeyType="next" autoCapitalize="sentences" />
          <Text style={[taskStyles.label, { color: theme.accent }]}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput accessibilityLabel="Task description" style={[taskStyles.input, styles.description, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={description} onChangeText={setDescription} maxLength={2000} multiline textAlignVertical="top" editable={!saving} />
          <Text style={[taskStyles.label, { color: theme.accent }]}>DUE DATE & TIME (OPTIONAL)</Text>
          <View style={taskStyles.row}>
            <TaskButton label={displayDate} accessibilityLabel={`Due date: ${dueDate ?? "none"}`} theme={theme} disabled={saving} onPress={() => setPicker("date")} />
            {dueDate && <TaskButton label="Clear date" theme={theme} disabled={saving} onPress={() => { setDueDate(null); setPicker(null); }} />}
            <TaskButton label={displayTime} accessibilityLabel={`Due time: ${dueTime ?? "none"}`} theme={theme} disabled={saving} onPress={() => setPicker("time")} />
            {dueTime && <TaskButton label="Clear time" theme={theme} disabled={saving} onPress={() => { setDueTime(null); setPicker(null); }} />}
          </View>
          {picker && <View>
            <DateTimePicker value={picker === "date" ? dateValue : timeValue} mode={picker} display={Platform.OS === "ios" ? "spinner" : "default"}
              themeVariant={light ? "light" : "dark"}
              onValueChange={(_event, value) => {
                chooseDue(picker, value);
                if (Platform.OS !== "ios") setPicker(null);
              }} onDismiss={() => setPicker(null)} />
            {Platform.OS === "ios" && <TaskButton label="Done" theme={theme} onPress={() => {
              chooseDue(picker, picker === "date" ? dateValue : timeValue); setPicker(null);
            }} />}
          </View>}
          <Text style={[taskStyles.label, { color: theme.accent }]}>PRIORITY</Text>
          <View style={taskStyles.row}>{TASK_PRIORITIES.map(value => <TaskButton key={value} label={value[0].toUpperCase() + value.slice(1)}
            accessibilityLabel={`${value} priority`} theme={theme} selected={priority === value} disabled={saving} onPress={() => setPriority(value)} />)}</View>
          {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[taskStyles.body, styles.error, { color: theme.error }]}>{error}</Text>}
          {conflict && <View style={styles.error}>
            <Text style={[taskStyles.body, { color: theme.muted }]}>Reloading replaces your unsaved edits with the saved task.</Text>
            <TaskButton label="Reload saved task" theme={theme} disabled={saving} onPress={() => { void onReload().catch(() => setError("Couldn’t reload this task. Try again.")); }} />
          </View>}
        </ScrollView>
        <View style={[styles.actions, { borderTopColor: theme.border }]}>
          <View style={styles.action}><TaskButton label="Cancel" theme={theme} disabled={saving} onPress={close} /></View>
          <View style={styles.action}><TaskButton label={saving ? "Saving…" : "Save task"} theme={theme} selected disabled={saving || deleted} onPress={() => void save()} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  heading: { fontSize: 24, fontWeight: "800" }, fields: { paddingHorizontal: 20, paddingBottom: 24 },
  description: { minHeight: 76, maxHeight: 150 }, error: { marginTop: 14, gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10, borderTopWidth: 1 },
  action: { flex: 1, minWidth: 120 },
});
