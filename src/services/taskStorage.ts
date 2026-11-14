import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTaskStore } from "./taskStore";

export const taskStore = createTaskStore(AsyncStorage);
