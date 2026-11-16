export type VoiceReminder = { title: string; date: Date };
export type VoiceParseResult = { reminder: VoiceReminder; error?: never } | { error: string; reminder?: never };

// Deliberately narrow grammar: never guess a missing date or AM/PM.
export function parseVoiceReminder(text: string, now = new Date()): VoiceParseResult {
  const match = /^remind me to (.+?) (today|tomorrow|on \d{4}-\d{2}-\d{2}) at (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i.exec(text.trim().replace(/[!?]$/, ''));
  if (!match) return { error: 'Say “Remind me to call Mom tomorrow at 3 PM”. Use today, tomorrow, or on YYYY-MM-DD, and an explicit time.' };
  const title = match[1].trim();
  if (!title || title.length > 150) return { error: 'Use a reminder title between 1 and 150 characters.' };
  let hour = Number(match[3]);
  const minute = Number(match[4] || 0);
  const meridiem = match[5]?.replace(/\./g, '').toLowerCase();
  if (minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12))) return { error: 'That time is invalid. Try 3 PM or 15:00.' };
  if (!meridiem && !match[4]) return { error: 'Please specify AM or PM, or use 24-hour HH:MM time.' };
  if (meridiem) hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  const date = new Date(now);
  const day = match[2].toLowerCase();
  if (day.startsWith('on ')) {
    const [year, month, dayOfMonth] = day.slice(3).split('-').map(Number);
    date.setFullYear(year, month - 1, dayOfMonth);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== dayOfMonth) return { error: 'That calendar date is invalid.' };
  } else if (day === 'tomorrow') date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  if (date.getHours() !== hour || date.getMinutes() !== minute) return { error: 'That local time does not exist because of a clock change. Choose another time.' };
  if (!Number.isFinite(date.getTime()) || date <= now) return { error: 'Choose a date and time in the future.' };
  return { reminder: { title, date } };
}
