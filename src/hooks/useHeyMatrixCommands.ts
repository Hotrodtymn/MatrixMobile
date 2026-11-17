import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { heyMatrix } from '../../modules/hey-matrix';
import { commitReminder, Reminder, SETTINGS_KEY } from '../services/reminders';
import { createVoiceReminderHandler } from '../services/voiceReminderSession';

export function useHeyMatrixCommands(onSaved: (records: Reminder[]) => void) {
  useEffect(() => {
    const module = heyMatrix;
    if (!module?.takeVoiceRequest || !module.setHostReady || !module.isSaveAuthorized || !module.parsedReminder || !module.voiceSaved) return;
    const native = module;
    let disposed = false, polling = false;
    const authorized = async (id: string) => !disposed && AppState.currentState === 'active' && !!await native.isSaveAuthorized?.(id);
    const handle = createVoiceReminderHandler({
      authorized,
      parsed: async (id, title, date, readback) => { await native.parsedReminder?.(id, title, date, readback); },
      rejected: async id => { await native.rejectVoiceCommand?.(id); },
      saved: async (id, ok) => { await native.voiceSaved?.(id, ok); },
      save: async (id, proposal) => {
        const settings = JSON.parse(await AsyncStorage.getItem(SETTINGS_KEY) || '{}');
        if (settings.notificationsEnabled === false || !(await Notifications.getPermissionsAsync()).granted) throw new Error('Notifications unavailable');
        // Empty base means create-only. The stable session ID makes retries idempotent.
        const result = await commitReminder({ id: `voice-${id}`, ...proposal, notificationId: '', recurrence: 'once', completed: false, starred: false, subtasks: [] },
          { base: [], notificationsEnabled: true, authorized: () => authorized(id) });
        if (!disposed) onSaved(result.records);
      },
    });
    async function poll() {
      if (disposed) return;
      // Heartbeat remains independent of slow reminder scheduling/storage work.
      await native.setHostReady?.(AppState.currentState === 'active').catch(() => undefined);
      if (polling || disposed) return;
      polling = true;
      try {
        const request = await native.takeVoiceRequest?.();
        if (request && !disposed) await handle(request);
      } catch { /* Native deadlines recover without logging transcripts or payloads. */ }
      finally { polling = false; }
    }
    const interval = setInterval(() => void poll(), 200);
    const subscription = AppState.addEventListener('change', state => { void native.setHostReady?.(state === 'active').catch(() => undefined); });
    void poll();
    return () => { disposed = true; clearInterval(interval); subscription.remove(); void native.setHostReady?.(false).catch(() => undefined); };
  }, [onSaved]);
}
