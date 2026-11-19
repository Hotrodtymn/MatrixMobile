"use no memo";
import React from 'react';
import { enqueueWidgetRender } from './widgetRenderQueue';
import { FlexWidget, TextWidget, WidgetInfo, WidgetTaskHandlerProps, WidgetRepresentation } from 'react-native-android-widget';
import { TODAY_WIDGET_URI } from '../services/todayWidgetNavigation';
import { loadTodayWidget } from './loadTodayWidget';
import { TodayWidgetModel, priorityPresentation, WIDGET_NAME } from './todayWidgetModel';

export function MatrixTodayWidget({ model, height, light }: { model: TodayWidgetModel; height: number; light: boolean }) {
  const text = light ? '#172025' : '#F4F8F8';
  const muted = light ? '#45585D' : '#B9C7CB';
  const limit = Math.max(1, Math.min(5, Math.floor((height - 60) / 21)));
  const rows = model.rows.slice(0, limit);
  return <FlexWidget style={{ width: 'match_parent', height: 'match_parent', backgroundColor: light ? '#F3F7F7' : '#171C1E', padding: 6 }}
    clickAction="OPEN_URI" clickActionData={{ uri: TODAY_WIDGET_URI }} accessibilityLabel="Matrix Today. Open Today Dashboard">
    <TextWidget text={`Today · ${model.date}`} maxLines={1} truncate="END" style={{ color: text, fontSize: 13, fontWeight: 'bold' }} />
    {model.state === 'error' ? <TextWidget text="Cannot load Today · tap to open Matrix" maxLines={2} style={{ color: muted, fontSize: 12 }} /> : <FlexWidget style={{ width: 'match_parent' }}>
      {rows.length ? rows.map(row => <FlexWidget key={row.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <TextWidget text={`${priorityPresentation(row.priority).label}${row.priority === 'none' ? '' : ' · '}${row.time}  `} maxLines={1} style={{ color: row.priority === 'none' ? muted : light ? priorityPresentation(row.priority).lightColor : priorityPresentation(row.priority).color, fontSize: 11, fontWeight: 'bold' }} />
        <FlexWidget style={{ flex: 1 }}><TextWidget text={row.title} maxLines={1} truncate="END" style={{ color: text, fontSize: 12 }} /></FlexWidget>
      </FlexWidget>) : <TextWidget text="No more reminders today" maxLines={1} style={{ color: muted, fontSize: 12 }} />}
      <TextWidget text={model.alarm} maxLines={1} truncate="END" style={{ color: text, fontSize: 11, marginTop: 2 }} />
    </FlexWidget>}
    <TextWidget text={`${model.state === 'error' ? 'Not current' : 'Updated ' + model.updated}${model.rows.length > limit ? ` · +${model.rows.length - limit} more` : ''}${model.warning ? ' · Review alarms' : ''}`} maxLines={1} truncate="END" style={{ color: muted, fontSize: 9, marginTop: 2 }} />
  </FlexWidget>;
}
export function todayWidgetRepresentation(model: TodayWidgetModel, info: Pick<WidgetInfo, 'height'>): WidgetRepresentation {
  const height = Number.isFinite(info.height) && info.height > 0 ? info.height : 80;
  return { light: <MatrixTodayWidget model={model} height={height} light />, dark: <MatrixTodayWidget model={model} height={height} light={false} /> };
}
// Serialize native draw submissions to prevent a slow earlier event overwriting a later snapshot.

export function compatibilityWidgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== WIDGET_NAME || !['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(props.widgetAction)) return Promise.resolve();
  return enqueueWidgetRender(async () => {
    const model = await loadTodayWidget();
    props.renderWidget(todayWidgetRepresentation(model, props.widgetInfo));
  });

}
