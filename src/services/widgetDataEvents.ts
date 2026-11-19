// Read-only observers: failures must never alter persistence or notification results.
const listeners = new Set<() => void>();
export function subscribeWidgetData(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyWidgetDataChanged(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* widget delivery is best effort */ }
  }
}
// Coalesce concurrent saves, then re-read once more if a write arrived during rendering.
export function createWidgetRefreshController(refresh: () => Promise<void>): () => void {
  let running = false;
  let dirty = false;
  const request = () => {
    dirty = true;
    if (running) return;
    running = true;
    void Promise.resolve().then(async () => {
      try { do { dirty = false; await refresh(); } while (dirty); }
      catch { /* failed widget work never rejects a save */ }
      finally { running = false; if (dirty) request(); }
    });
  };
  return request;
}