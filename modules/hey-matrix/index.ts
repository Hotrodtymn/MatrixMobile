import { NativeModule, requireOptionalNativeModule } from 'expo';
export type HeyMatrixDiagnostics = {
  stage: string; serviceStarted: boolean; modelLoaded: boolean; microphoneActive: boolean;
  samplesRead: number; decodeSteps: number; inputObserved: boolean; lastAudioAt: number;
  lastDetectionAt: number; toneStatus: string; lastErrorCode: string;
};
export type HeyMatrixState = { state: 'stopped' | 'starting' | 'listening' | 'cooldown' | 'stopping' | 'error'; message: string; detections: number; occupied: boolean; diagnostics?: HeyMatrixDiagnostics };
declare class HeyMatrixNative extends NativeModule {
  getState(): HeyMatrixState;
  startListening(): Promise<HeyMatrixState>;
  stopListening(): Promise<void>;
  canStartListening?(): Promise<boolean>;
  testTone?(): Promise<void>;
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

// Permission dialogs can resolve before Activity window focus returns. Wait briefly;
// never start from a background session, and keep native start validation authoritative.
export async function waitForHeyMatrixFocus(isActive: () => boolean): Promise<void> {
  if (!heyMatrix?.canStartListening) return; // Older APK still has native start guards.
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!isActive()) throw new Error('Return to Matrix and enable listening again.');
    if (await heyMatrix.canStartListening()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Close Android dialogs, keep Matrix visible, then enable Hey Matrix again.');
}
