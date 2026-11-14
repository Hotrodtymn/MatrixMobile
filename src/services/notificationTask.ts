import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { handleNotificationResponse } from "./reminders";

const TASK = "matrix-notification-actions-v1";
TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data, error }) => {
  if (error) throw error;
  if ("actionIdentifier" in data) await handleNotificationResponse(data);
});

// Import at entry, before mounting React, so Android can invoke the handler headlessly.
if (Platform.OS === "android") {
  void Notifications.registerTaskAsync(TASK).catch(error => {
    console.error("Could not register notification actions:", error);
  });
}
