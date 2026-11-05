// Dias locais (por fuso), ofensiva e utilidades compartilhadas entre app e Worker.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions, key: string) {
  const k = tz + key;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opts });
    fmtCache.set(k, f);
  }
  return f;
}

/** "YYYY-MM-DD" do instante `ts` no fuso `tz`. */
export function dayKey(ts: number, tz: string): string {
  const parts = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'd').formatToParts(new Date(ts));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** Hora (0–23) e minuto locais. */
export function localTime(ts: number, tz: string): { hour: number; minute: number } {
  const parts = fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 't').formatToParts(new Date(ts));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { hour: g('hour') % 24, minute: g('minute') };
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Instante (ms) do início do dia local `key` (busca por bisseção; robusto a DST). */
export function startOfDay(key: string, tz: string): number {
  let lo = Date.parse(key + 'T00:00:00Z') - 36 * 3600e3;
  let hi = lo + 72 * 3600e3;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(mid, tz) < key) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface StreakInfo {
  streak: number;
  longest: number;
  studiedToday: boolean;
  /** há ofensiva ativa e hoje ainda não estudou */
  atRisk: boolean;
  freezes: number;
  freezesUsed: number;
}

export const MAX_FREEZES = 2;
export const FREEZE_EARN_EVERY = 7;

/**
 * Ofensiva determinística a partir do conjunto de dias estudados.
 * Com `freeze`: a cada 7 dias seguidos ganha-se 1 congelamento (máx. 2) que cobre um dia perdido.
 * Hoje ainda "em aberto" nunca zera a ofensiva.
 */
export function computeStreak(studyDays: Iterable<string>, today: string, freeze = false): StreakInfo {
  const set = new Set(studyDays);
  const sorted = [...set].filter((d) => d <= today).sort();
  const info: StreakInfo = { streak: 0, longest: 0, studiedToday: set.has(today), atRisk: false, freezes: 0, freezesUsed: 0 };
  if (!sorted.length) return info;
  let streak = 0, freezes = 0, used = 0, longest = 0;
  for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
    if (set.has(d)) {
      streak++;
      if (freeze && streak % FREEZE_EARN_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    } else if (d === today) {
      /* dia ainda aberto */
    } else if (freeze && freezes > 0) {
      freezes--;
      used++;
    } else streak = 0;
    longest = Math.max(longest, streak);
  }
  info.streak = streak;
  info.longest = longest;
  info.freezes = freezes;
  info.freezesUsed = used;
  info.atRisk = streak > 0 && !info.studiedToday;
  return info;
}
