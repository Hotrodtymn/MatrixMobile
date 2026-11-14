import { Platform } from "react-native";
import AlarmScheduler from "react-native-alarm-scheduler";

const native = AlarmScheduler as typeof AlarmScheduler & {
  setFlipToSilenceEnabledAsync?: (enabled: boolean) => Promise<boolean>;
};
export const supportsFlipToSilence = Platform.OS === "android" && typeof native.setFlipToSilenceEnabledAsync === "function";
export async function setFlipToSilence(enabled: boolean) {
  if (!supportsFlipToSilence) return;
  if (!await native.setFlipToSilenceEnabledAsync!(enabled)) throw new Error("Could not save the alarm setting.");
}
