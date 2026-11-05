import { addDays, computeStreak, dayKey, startOfDay, type StreakInfo } from '../../shared/days';
import { parseCardId, State, type CardRec, type ReviewRec } from './srs';
import type { Store } from './db';

export interface Settings {
  dailyGoal: number;
  newPerDay: number;
  tz: string;
  freeze: boolean;
  remindEnabled: boolean;
  remindTime: string; // HH:MM
  streakAlertHours: number;
}

export function defaultTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

export const SETTING_KEYS = ['dailyGoal', 'newPerDay', 'tz', 'freeze', 'remindEnabled', 'remindTime', 'streakAlertHours'] as const;

export async function loadSettings(store: Store): Promise<Settings> {
  const g = async (k: string) => store.getSetting(k);
  const num = (v: string | undefined, d: number) => (v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : d);
  return {
    dailyGoal: num(await g('dailyGoal'), 20),
    newPerDay: num(await g('newPerDay'), 8),
    tz: (await g('tz')) || defaultTz(),
    freeze: (await g('freeze')) === '1',
    remindEnabled: (await g('remindEnabled')) === '1',
    remindTime: (await g('remindTime')) || '19:00',
    streakAlertHours: num(await g('streakAlertHours'), 3),
  };
}

export async function saveSetting<K extends keyof Settings>(store: Store, key: K, value: Settings[K]) {
  const v = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  await store.setSetting(key, v);
}

export function studyDays(reviews: ReviewRec[], tz: string): Set<string> {
  const s = new Set<string>();
  for (const r of reviews) s.add(dayKey(r.ts, tz));
  return s;
}

export function streakFor(reviews: ReviewRec[], now: number, st: Settings): StreakInfo {
  return computeStreak(studyDays(reviews, st.tz), dayKey(now, st.tz), st.freeze);
}

export function reviewsOnDay(reviews: ReviewRec[], day: string, tz: string): number {
  return reviews.reduce((n, r) => n + (dayKey(r.ts, tz) === day ? 1 : 0), 0);
}

/** Retenção: % de acertos nas revisões (exclui a 1ª exposição de cada cartão) dos últimos `days` dias. */
export function retention(reviews: ReviewRec[], now: number, days = 30): { pct: number | null; n: number } {
  const sorted = [...reviews].sort((a, b) => a.ts - b.ts);
  const seen = new Set<string>();
  let ok = 0, n = 0;
  const from = now - days * 86400e3;
  for (const r of sorted) {
    if (!seen.has(r.card)) {
      seen.add(r.card);
      continue;
    }
    if (r.ts >= from) {
      n++;
      ok += r.correct;
    }
  }
  return { pct: n ? Math.round((ok / n) * 100) : null, n };
}

export interface ErrRow {
  label: string;
  total: number;
  wrong: number;
}

/** Erros por caso/número nos cartões gerativos. */
export function errorsByCase(reviews: ReviewRec[]): ErrRow[] {
  const m = new Map<string, ErrRow>();
  const names: Record<string, string> = { nom: 'Nominativo', acc: 'Acusativo', gen: 'Genitivo', dat: 'Dativo', inst: 'Instrumental', prep: 'Preposicional' };
  for (const r of reviews) {
    const { kind, ref } = parseCardId(r.card);
    if (kind !== 'gram') continue;
    const [, c, n] = ref.split('|');
    const label = `${names[c] ?? c} ${n === 'pl' ? 'plural' : 'singular'}`;
    const row = m.get(label) ?? { label, total: 0, wrong: 0 };
    row.total++;
    row.wrong += 1 - r.correct;
    m.set(label, row);
  }
  return [...m.values()].sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.total - a.total);
}

/** Cartões devidos até o fim do dia local. */
export function dueToday(cards: CardRec[], now: number, tz: string): CardRec[] {
  const endOfToday = startOfDay(addDays(dayKey(now, tz), 1), tz);
  return cards.filter((c) => c.fsrs.reps > 0 && c.due < endOfToday);
}

export function dueNow(cards: CardRec[], now: number): CardRec[] {
  return cards.filter((c) => c.fsrs.reps > 0 && c.due <= now).sort((a, b) => a.due - b.due);
}

export function matureCount(cards: CardRec[]): number {
  return cards.filter((c) => c.fsrs.state === State.Review && c.fsrs.stability >= 21).length;
}
