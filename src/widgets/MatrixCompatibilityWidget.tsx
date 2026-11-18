"use no memo";

import React from 'react';
import { FlexWidget, TextWidget, WidgetTaskHandlerProps } from 'react-native-android-widget';

// Compile/render probe only: no Matrix data, schedules, navigation or periodic work.
export function MatrixCompatibilityWidget() {
  return <FlexWidget style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center', alignItems: 'center', backgroundColor: '#171C1E', padding: 12 }}>
    <TextWidget text="Matrix compatibility test" style={{ color: '#FFFFFF', fontSize: 16 }} />
  </FlexWidget>;
}
export async function compatibilityWidgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== 'MatrixCompatibility') return;
  if (props.widgetAction === 'WIDGET_ADDED' || props.widgetAction === 'WIDGET_UPDATE' || props.widgetAction === 'WIDGET_RESIZED') {
    props.renderWidget(<MatrixCompatibilityWidget />);
  }
}
