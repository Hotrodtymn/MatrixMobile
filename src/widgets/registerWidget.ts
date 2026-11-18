// Non-Android entry: do not import or invoke the Android-only native library.
export function registerCompatibilityWidget(): void {
  // Native registration is provided by registerWidget.android.ts on Android.
}
