import { parseVoiceReminder } from './voiceCommand';
export type VoiceRequest = { id: string; kind: 'parse' | 'save'; text?: string; title?: string; date?: string };
export type VoiceProposal = { title: string; date: string };
export function createVoiceReminderHandler(deps: {
  authorized(id: string): Promise<boolean>;
  parsed(id: string, title: string, date: string, readback: string): Promise<void>;
  rejected(id: string): Promise<void>;
  saved(id: string, ok: boolean): Promise<void>;
  save(id: string, proposal: VoiceProposal): Promise<void>;
}) {
  const proposals = new Map<string, VoiceProposal>();
  const consumed = new Set<string>();
  return async (request: VoiceRequest) => {
    if (request.kind === 'parse') {
      proposals.clear(); // Only one native session can own a proposal.
      const parsed = parseVoiceReminder(request.text ?? '');
      if (!parsed.reminder) { await deps.rejected(request.id); return; }
      const proposal = { title: parsed.reminder.title, date: parsed.reminder.date.toISOString() };
      proposals.set(request.id, proposal);
      const when = parsed.reminder.date.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      await deps.parsed(request.id, proposal.title, proposal.date, `Create reminder: ${proposal.title}. On ${when}. Say yes to save, or no to cancel.`);
    } else {
      const proposal = proposals.get(request.id);
      if (!proposal || consumed.has(request.id) || proposal.title !== request.title || proposal.date !== request.date || !await deps.authorized(request.id)) { await deps.saved(request.id, false); return; }
      consumed.add(request.id); proposals.delete(request.id);
      if (consumed.size > 100) consumed.delete(consumed.values().next().value!);
      let ok = false;
      try { await deps.save(request.id, proposal); ok = true; } catch { /* No payload logging. */ }
      await deps.saved(request.id, ok);
    }
  };
}
