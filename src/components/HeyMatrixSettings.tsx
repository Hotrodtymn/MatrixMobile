import React, { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';
import { heyMatrix, HeyMatrixState, stopHeyMatrix, waitForHeyMatrixFocus } from '../../modules/hey-matrix';
import { taskTheme } from './tasks/taskTheme';
const speech = requireOptionalNativeModule<typeof SpeechModule>('ExpoSpeechRecognition');
export function HeyMatrixSettings({ light }: { light: boolean }) {
  const c = taskTheme(light);
  const [snapshot, setSnapshot] = useState<HeyMatrixState>({ state: 'stopped', message: 'Hey Matrix is off.', detections: 0, occupied: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    function refresh() {
      try { if (heyMatrix) setSnapshot(heyMatrix.getState()); }
      catch { setError('Could not read native listening status. Restart Matrix and try again.'); }
    }
    refresh();
    const timer = setInterval(refresh, 500);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const enabled = snapshot.occupied;
  const d = snapshot.diagnostics;
  const time = (value: number) => value ? new Date(value).toLocaleTimeString() : 'None this session';
  async function toggle(value: boolean) {
    if (!heyMatrix || busy) return;
    setBusy(true); setError('');
    try {
      if (!value) await stopHeyMatrix();
      else {
        if (AppState.currentState !== 'active') throw new Error('Open Matrix to start listening.');
        if (!speech || !(await speech.requestPermissionsAsync()).granted) throw new Error('Allow microphone permission in Android app settings.');
        if (!(await Notifications.requestPermissionsAsync()).granted) throw new Error('Allow notifications so Stop Listening remains accessible.');
        if (AppState.currentState !== 'active') throw new Error('Return to Matrix and enable listening again.');
        // Foreground STT and wake detection must never own the microphone together.
        speech.abort();
        await waitForHeyMatrixFocus(() => AppState.currentState === 'active');
        setSnapshot(await heyMatrix.startListening());
      }
      setSnapshot(heyMatrix.getState());
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update listening.'); }
    finally { setBusy(false); }
  }
  return <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 10, marginVertical: 12 }}>
    <Text style={{ color: c.text, fontWeight: '700' }}>Hey Matrix (experimental)</Text>
    <Text style={{ color: c.muted }}>Listen on device for “Hey Matrix” and play a short tone. Uses the microphone and extra battery while your screen is locked. No audio is saved. While Matrix is visible and unlocked, speak a reminder after the tone, hear its readback, then say yes to save or no to cancel. Background and locked-screen command capture are deferred. Listening must be enabled again after the service stops.</Text>
    <Switch accessibilityLabel="Hey Matrix listening" value={enabled} disabled={busy || !heyMatrix || Platform.OS !== 'android'} onValueChange={value => void toggle(value)} />
    <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{snapshot.state}: {snapshot.message}</Text>
    <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>Voice phase: {snapshot.voicePhase ?? 'Requires updated APK'}</Text>
    <Text style={{ color: c.muted }}>{snapshot.voiceStatus ?? 'Install the updated APK for hands-free reminders.'}</Text>
    <Text style={{ color: c.muted }}>Wake detections this process: {snapshot.detections}</Text>
    {d ? <View style={{ gap: 6 }}>
      <Text style={{ color: c.text }}>Startup stage: {d.stage}</Text>
      <Text style={{ color: c.muted }}>Service: {d.serviceStarted ? 'started' : 'not running'} · Model: {d.modelLoaded ? 'loaded' : 'not loaded'} · Microphone: {d.microphoneActive ? 'active' : 'inactive'}</Text>
      <Text style={{ color: c.muted }}>Captured samples: {d.samplesRead} · Decode steps: {d.decodeSteps}</Text>
      <Text style={{ color: c.muted }}>Nonzero input observed: {d.inputObserved ? 'yes (not proof of intelligible speech)' : 'no'} · Last capture: {time(d.lastAudioAt)}</Text>
      <Text style={{ color: c.muted }}>Last wake detection: {time(d.lastDetectionAt)}</Text>
      <Text style={{ color: c.muted }}>Acknowledgment: {d.toneStatus}</Text>
      <Text style={{ color: c.muted }}>Voice stage: {d.voiceStage ?? 'Requires updated APK'} · Last wake mic release: {time(d.wakeReleasedAt ?? 0)}</Text>
      {!!d.voiceFailure?.code && <View style={{ gap: 4 }}>
        <Text style={{ color: c.error }}>Last voice failure: {d.voiceFailure.code} at {time(d.voiceFailure.at)}</Text>
        <Text style={{ color: c.muted }}>Phase: {d.voiceFailure.phase} · Stage: {d.voiceFailure.stage}</Text>
        <Text style={{ color: c.muted }}>Android code: {d.voiceFailure.androidCode >= 0 ? d.voiceFailure.androidCode : 'not supplied'} · Exception: {d.voiceFailure.exceptionType || 'none reported'} · Main thread: {String(d.voiceFailure.mainThread)}</Text>
        <Text style={{ color: c.muted }}>Wake microphone release before failure: {time(d.voiceFailure.wakeReleasedAt)}</Text>
        <Text style={{ color: c.error }}>{d.voiceFailure.explanation}</Text>
      </View>}
      {!!d.voiceCleanupException && <Text style={{ color: c.error }}>Recognizer cleanup exception: {d.voiceCleanupException}. Restart Matrix before listening again.</Text>}
      {!!d.lastErrorCode && <Text style={{ color: c.error }}>Error code: {d.lastErrorCode}</Text>}
    </View> : heyMatrix ? <Text style={{ color: c.muted }}>Detailed diagnostics require the updated APK.</Text> : null}
    <Text style={{ color: c.muted }}>If Service is not started, enable listening while Matrix is open. If capture stays at zero, check microphone permission and the Android microphone privacy switch. If detections increase without a tone, raise media volume and test the tone. A loaded model alone does not prove wake detection.</Text>
    {!!heyMatrix?.testTone && <Pressable accessibilityRole="button" disabled={!enabled || busy} style={{ minHeight: 48, justifyContent: 'center', opacity: enabled ? 1 : 0.5 }} onPress={() => {
      const native = heyMatrix;
      if (!native?.testTone) return;
      void native.testTone().then(() => setSnapshot(native.getState())).catch(() => setError('Could not test acknowledgment. Enable listening and check Android media volume.'));
    }}><Text style={{ color: c.accent }}>Test acknowledgment tone</Text></Pressable>}
    {!heyMatrix && <Text style={{ color: c.muted }}>Install the new Android APK to enable Hey Matrix.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: c.error }}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setError('Open Android Settings → Apps → Matrix manually.')); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.accent }}>Open Android app settings</Text></Pressable>
  </View>;
}
