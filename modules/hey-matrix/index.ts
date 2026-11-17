import { NativeModule, requireOptionalNativeModule } from 'expo';
export type HeyMatrixState = { state: 'stopped' | 'starting' | 'listening' | 'cooldown' | 'stopping' | 'error'; message: string; detections: number; occupied: boolean };
declare class HeyMatrixNative extends NativeModule {
  getState(): HeyMatrixState;
  startListening(): Promise<HeyMatrixState>;
  stopListening(): Promise<void>;
}
export const heyMatrix = requireOptionalNativeModule<HeyMatrixNative>('HeyMatrix');
export async function stopHeyMatrix(): Promise<void> {
  if (!heyMatrix) return;
  await heyMatrix.stopListening();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!heyMatrix.getState().occupied) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Hey Matrix is still releasing the microphone. Try again.');
}
