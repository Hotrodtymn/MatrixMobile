export const TODAY_WIDGET_URI = 'matrix-today://dashboard/today';
export function isTodayWidgetURL(url: unknown): boolean { return url === TODAY_WIDGET_URI; }
type LinkSource = {
  getInitialURL(): Promise<string | null>;
  addEventListener(event: 'url', listener: (event: { url: string }) => void): { remove(): void };
};
export function subscribeTodayWidgetLinks(source: LinkSource, openToday: () => void): () => void {
  let active = true;
  let liveLinkReceived = false;
  const subscription = source.addEventListener('url', ({ url }) => {
    liveLinkReceived = true;
    if (active && isTodayWidgetURL(url)) openToday();
  });
  void source.getInitialURL().then(url => {
    if (active && !liveLinkReceived && isTodayWidgetURL(url)) openToday();
  }).catch(() => undefined);
  return () => { active = false; subscription.remove(); };
}
