import { stopHeyMatrix } from "../../modules/hey-matrix";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { requireOptionalNativeModule } from "expo";
import type { ExpoSpeechRecognitionModule as SpeechModule } from "expo-speech-recognition";
import { parseVoiceReminder, VoiceReminder } from "../services/voiceCommand";
import { taskTheme, taskStyles as s } from "./tasks/taskTheme";

// Old binaries can still open the app and explain why a new APK is needed.
const speech = requireOptionalNativeModule<typeof SpeechModule>("ExpoSpeechRecognition");
function VoiceButton({ label, onPress, disabled = false, light }: { label: string; onPress: () => void; disabled?: boolean; light: boolean }) {
  const c = taskTheme(light);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.button, { borderColor: c.border }, disabled && s.disabled]}><Text style={{ color: c.accent }}>{label}</Text></Pressable>;
}
export function VoiceCommand({ light, disabled, onReview }: { light: boolean; disabled: boolean; onReview: (reminder: VoiceReminder, transcript: string) => void }) {
  const c = taskTheme(light);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState('Tap Start and speak a reminder.');
  const [denied, setDenied] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const finalText = useRef('');

  function cancel(close = false) {
    generation.current++;
    active.current = false;
    speech?.abort();
    setBusy(false); setText(''); finalText.current = '';
    setStatus('Cancelled. No reminder was created.');
    if (close) setOpen(false);
  }
  useEffect(() => {
    if (!speech) return;
    const lifecycle = generation;
    const subscriptions = [
      speech.addListener('result', event => {
        if (!active.current) return;
        const transcript = event.results[0]?.transcript ?? '';
        setText(transcript);
        if (event.isFinal) finalText.current = transcript;
      }),
      speech.addListener('error', event => {
        if (!active.current) return;
        active.current = false; setBusy(false); finalText.current = ''; setText('');
        setStatus(event.error === 'aborted' ? 'Cancelled. No reminder was created.' : `Recognition failed (${event.error}). Try again or enter the command below. If using on-device recognition, check that English speech models are installed.`);
      }),
      speech.addListener('end', () => {
        if (!active.current) return;
        active.current = false; setBusy(false);
        setText(finalText.current);
        setStatus(finalText.current ? 'Review the recognized text, then interpret it.' : 'No speech recognized. Try again or type the command.');
      }),
    ];
    const appState = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { lifecycle.current++; active.current = false; subscriptions.forEach(item => item.remove()); appState.remove(); speech.abort(); };
  }, []);
  async function start() {
    if (busy) return;
    if (!speech || Platform.OS !== 'android') { setStatus('Voice input requires the new Matrix Android APK. You can type a command below.'); return; }
    const token = ++generation.current;
    setBusy(true); setDenied(false); setText(''); finalText.current = '';
    try {
      await stopHeyMatrix();
      if (token !== generation.current) return;
      const permission = await speech.requestPermissionsAsync();
      if (token !== generation.current) return;
      if (!permission.granted) { setDenied(true); setStatus('Microphone permission denied. Allow it in Android app settings or type your command.'); setBusy(false); return; }
      if (!speech.isRecognitionAvailable()) throw new Error('No Android speech recognition service is available.');
      const offline = speech.supportsOnDeviceRecognition();
      active.current = true;
      setStatus(offline ? 'Listening on device… Tap Stop when done.' : 'Listening through your Android speech service… It may use the network. Tap Stop when done.');
      speech.start({ lang: 'en-US', interimResults: true, continuous: false, requiresOnDeviceRecognition: offline });
    } catch (error) {
      if (token !== generation.current) return;
      active.current = false; setBusy(false);
      setStatus(`Could not start recognition: ${error instanceof Error ? error.message : 'Try again.'}`);
    }
  }
  return <>
    <VoiceButton light={light} label="🎙 Voice" disabled={disabled} onPress={() => { setOpen(true); setStatus('Tap Start and speak a reminder. Android speech services may use the network when on-device recognition is unavailable.'); }} />
    <Modal visible={open} animationType="slide" onRequestClose={() => cancel(true)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Text style={{ color: c.text, fontSize: 24 }}>Voice reminder</Text>
          <Text accessibilityLiveRegion="polite" style={{ color: c.muted }}>{status}</Text>
          <View style={s.row}><VoiceButton light={light} label="Start microphone" onPress={() => void start()} disabled={busy} /><VoiceButton light={light} label="Stop" onPress={() => speech?.stop()} disabled={!busy} /><VoiceButton light={light} label="Cancel recording" onPress={() => cancel()} disabled={!busy} /></View>
          {denied && <VoiceButton light={light} label="Open app settings" onPress={() => { void Linking.openSettings().catch(() => setStatus('Open Android Settings → Apps → Matrix → Permissions.')); }} />}
          <Text style={{ color: c.text }}>Recognized text (editable)</Text>
          <TextInput accessibilityLabel="Recognized command" multiline editable={!busy} value={text} onChangeText={setText} placeholder="Remind me to call Mom tomorrow at 3 PM" placeholderTextColor={c.muted} style={[s.input, { color: c.text, borderColor: c.border }]} />
          <VoiceButton light={light} label="Review reminder" onPress={() => {
            const parsed = parseVoiceReminder(text);
            if (!parsed.reminder) { setStatus(parsed.error); return; }
            const transcript = text;
            cancel(true);
            onReview(parsed.reminder, transcript);
          }} disabled={busy || !text.trim()} />
          <Text style={{ color: c.muted }}>Nothing is saved until you review the title and local date/time in the reminder editor and tap Save.</Text>
          <VoiceButton light={light} label="Close" onPress={() => cancel(true)} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}
