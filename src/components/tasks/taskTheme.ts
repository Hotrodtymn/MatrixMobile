import { StyleSheet } from "react-native";

const dark = { background: "#171C1E", surface: "#252D30", border: "#3B484B", text: "#FFFFFF", muted: "#A7B8B6", accent: "#48D6C1", selected: "#263D3B", error: "#E7A39B" };
const light = { background: "#F3F6F5", surface: "#FFFFFF", border: "#C5D4D0", text: "#182321", muted: "#526560", accent: "#167E73", selected: "#E5F2EF", error: "#9C3D36" };
export type TaskTheme = typeof dark;
export function taskTheme(isLight: boolean): TaskTheme { return isLight ? light : dark; }
export const taskStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 13, fontWeight: "700" },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 10, marginBottom: 6 },
  input: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 10, fontSize: 15 },
  body: { fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
