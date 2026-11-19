import { enqueueWidgetRender } from './widgetRenderQueue';
import { AppState } from 'react-native';
import { getWidgetInfo, registerWidgetTaskHandler, requestWidgetUpdateById } from 'react-native-android-widget';
import { subscribeWidgetData, createWidgetRefreshController } from '../services/widgetDataEvents';
import { compatibilityWidgetTaskHandler, todayWidgetRepresentation } from './MatrixCompatibilityWidget';
import { loadTodayWidget } from './loadTodayWidget';
import { WIDGET_NAME } from './todayWidgetModel';
let registered = false;
export function registerCompatibilityWidget(): void {
  if (registered) return;
  registered = true;
  registerWidgetTaskHandler(compatibilityWidgetTaskHandler);
  const refresh = createWidgetRefreshController(() => enqueueWidgetRender(async () => {
    const widgets = await getWidgetInfo(WIDGET_NAME);
    if (!widgets.length) return; // No reads/work when no widget is installed.
    const model = await loadTodayWidget();
    // By-id API awaits rendering; the 0.26.0 all-widget API uses an unawaited async forEach.
    await Promise.all(widgets.map(info => requestWidgetUpdateById({ widgetName: WIDGET_NAME, widgetId: info.widgetId,
      renderWidget: current => todayWidgetRepresentation(model, current) })));
  }));
  subscribeWidgetData(refresh);
  AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
  if (AppState.currentState === 'active') refresh(); // Headless startup renders only on its lifecycle event.
}
