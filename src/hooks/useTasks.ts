import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { taskStore } from "../services/taskStorage";
import { TaskSnapshot } from "../services/taskStore";

export function useTasks() {
  const [snapshot, setSnapshot] = useState<TaskSnapshot>({ tasks: [], skippedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const next = await taskStore.list();
      if (mounted.current && current === request.current) { setSnapshot(next); setError(null); }
      return next;
    } catch (failure) {
      if (mounted.current && current === request.current) setError("Tasks couldn’t be loaded. Try again; your saved data has not been changed.");
      throw failure;
    } finally {
      if (mounted.current && current === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const reload = () => { void refresh().catch(() => undefined); };
    const unsubscribe = taskStore.subscribe(reload);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") reload(); });
    reload();
    return () => { mounted.current = false; unsubscribe(); subscription.remove(); };
  }, [refresh]);
  return { ...snapshot, loading, error, refresh };
}
