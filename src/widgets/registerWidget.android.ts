import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { compatibilityWidgetTaskHandler } from './MatrixCompatibilityWidget';

export function registerCompatibilityWidget(): void {
  registerWidgetTaskHandler(compatibilityWidgetTaskHandler);
}
