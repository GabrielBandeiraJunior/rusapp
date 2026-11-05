// Lembretes externos (Telegram) — regras puras + envio. Desligado por padrão.
import { computeStreak, dayKey, localTime } from '../../shared/days';

export type ReminderKind = 'daily' | 'streak';

export interface ReminderInput {
  now: number;
  tz: string;
  enabled: boolean;
  remindTime: string; // HH:MM no fuso `tz`
  streakAlertHours: number;
  freeze: boolean;
  studyDays: Iterable<string>;
  dueCount: number;
  sentToday: ReminderKind[];
}

export const MAX_PER_DAY = 2;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 19) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Decide qual lembrete (se algum) enviar agora. */
export function decideReminder(i: ReminderInput): ReminderKind | null {
  if (!i.enabled) return null;
  if (i.sentToday.length >= MAX_PER_DAY) return null;
  const today = dayKey(i.now, i.tz);
  const info = computeStreak(i.studyDays, today, i.freeze);
  if (info.studiedToday) return null; // já estudou hoje → silêncio
  const lt = localTime(i.now, i.tz);
  const nowMin = lt.hour * 60 + lt.minute;
  if (info.atRisk && !i.sentToday.includes('streak') && nowMin >= 24 * 60 - Math.max(1, i.streakAlertHours) * 60) return 'streak';
  if (!i.sentToday.includes('daily') && nowMin >= minutes(i.remindTime)) return 'daily';
  return null;
}

const DAILY = [
  'Hora de praticar russo! Você tem {due} cartões esperando. 🇷🇺',
  'Bora fazer sua sessão de russo de hoje? São {due} cartões para revisar.',
  'Только пять минут! Cinco minutinhos de russo já valem o dia.',
  'Seu russo não vai se estudar sozinho 😄 — {due} cartões na fila.',
  'Pausa para o russo: uma sessão curta mantém a memória afiada.',
  'Que tal uma rodada rápida de casos e vocabulário? {due} cartões pendentes.',
];
const STREAK = [
  'Atenção: sua ofensiva de {streak} dias está em risco! Estude um pouquinho antes da meia-noite.',
  'Faltam poucas horas — não deixe sua sequência de {streak} dias acabar hoje! 🔥',
  'Sua ofensiva de {streak} dias precisa de você. Uma sessão curta salva o dia.',
  '{streak} dias seguidos… vamos proteger essa sequência? Basta uma revisão.',
];

export function reminderText(kind: ReminderKind, day: string, vars: { due: number; streak: number }): string {
  const pool = kind === 'daily' ? DAILY : STREAK;
  let h = 0;
  for (const ch of day + kind) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length].replace('{due}', String(vars.due)).replace('{streak}', String(vars.streak));
}

export async function sendTelegram(
  token: string, chatId: string, text: string, fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.ok;
}
