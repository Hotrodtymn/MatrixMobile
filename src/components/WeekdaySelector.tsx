import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Store JS weekdays (0=Sunday); convert only at native API boundaries.
export function WeekdaySelector({ value, onChange, light = false }: {
  value: number[]; onChange: (days: number[]) => void; light?: boolean;
}) {
  return <View style={styles.row}>{WEEKDAYS.map((day, index) => {
    const selected = value.includes(index);
    return <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day}
      accessibilityState={{ checked: selected }}
      onPress={() => onChange(selected ? value.filter(item => item !== index) : [...value, index].sort())}
      style={[styles.day, light && styles.light, selected && styles.selected]}>
      <Text style={{ color: selected || light ? "#102D29" : "#E0EBE8", fontWeight: "700", fontSize: 12 }}>{day}</Text>
    </Pressable>;
  })}</View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginVertical: 8 },
  day: { flexGrow: 1, minWidth: 36, minHeight: 48, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#6D8982", borderRadius: 8 },
  light: { backgroundColor: "#EEF6F3" }, selected: { backgroundColor: "#48D6C1" },
});
