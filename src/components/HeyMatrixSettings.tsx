import React, { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';
import { heyMatrix, HeyMatrixState, stopHeyMatrix } from '../../modules/hey-matrix';
import { taskTheme } from './tasks/taskTheme';
const speech = requireOptionalNativeModule<typeof SpeechModule>('ExpoSpeechRecognition');
export function HeyMatrixSettings({ light }: { light: boolean }) {
  const c = taskTheme(light);
  const [snapshot, setSnapshot] = useState<HeyMatrixState>({ state: 'stopped', message: 'Hey Matrix is off.', detections: 0, occupied: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    function refresh() { if (heyMatrix) setSnapshot(heyMatrix.getState()); }
    refresh();
    const timer = setInterval(refresh, 500);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const enabled = snapshot.occupied;
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
        setSnapshot(await heyMatrix.startListening());
      }
      setSnapshot(heyMatrix.getState());
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update listening.'); }
    finally { setBusy(false); }
  }
  return <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 10, marginVertical: 12 }}>
    <Text style={{ color: c.text, fontWeight: '700' }}>Hey Matrix (experimental)</Text>
    <Text style={{ color: c.muted }}>Listen on device for “Hey Matrix” and play a short tone. Uses the microphone and extra battery while your screen is locked. No audio is saved and no commands are executed. Listening must be enabled again after the service stops.</Text>
    <Switch accessibilityLabel="Hey Matrix listening" value={enabled} disabled={busy || !heyMatrix || Platform.OS !== 'android'} onValueChange={value => void toggle(value)} />
    <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{snapshot.state}: {snapshot.message}</Text>
    <Text style={{ color: c.muted }}>Wake detections this process: {snapshot.detections}</Text>
    {!heyMatrix && <Text style={{ color: c.muted }}>Install the new Android APK to enable Hey Matrix.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: c.error }}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setError('Open Android Settings → Apps → Matrix manually.')); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.accent }}>Open Android app settings</Text></Pressable>
  </View>;
}
