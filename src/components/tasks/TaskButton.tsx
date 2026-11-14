import React from "react";
import { Pressable, Text } from "react-native";
import { taskStyles, TaskTheme } from "./taskTheme";

export function TaskButton({ label, onPress, theme, selected = false, disabled = false, danger = false, accessibilityLabel }: {
  label: string; onPress: () => void; theme: TaskTheme; selected?: boolean; disabled?: boolean; danger?: boolean; accessibilityLabel?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={[taskStyles.button, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.selected : theme.surface }, disabled && taskStyles.disabled]}>
    <Text style={[taskStyles.buttonText, { color: danger ? theme.error : selected ? theme.accent : theme.text }]}>{label}</Text>
  </Pressable>;
}
