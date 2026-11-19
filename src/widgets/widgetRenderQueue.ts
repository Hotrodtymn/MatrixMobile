// One JS queue for lifecycle renders and persistence-triggered draw submissions.
let rendering: Promise<void> = Promise.resolve();
export function enqueueWidgetRender(work: () => Promise<void>): Promise<void> {
  const result = rendering.then(work);
  rendering = result.catch(() => undefined);
  return result;
}
