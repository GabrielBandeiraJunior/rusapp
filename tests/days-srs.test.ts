import { describe, expect, it } from 'vitest';
import { addDays, computeStreak, dayKey, localTime, startOfDay } from '../shared/days';
import { replayCard, type ReviewRec } from '../src/lib/srs';

describe('dias locais', () => {
  it('dayKey respeita o fuso', () => {
    const ts = Date.UTC(2025, 0, 1, 2, 30); // 02:30 UTC
    expect(dayKey(ts, 'UTC')).toBe('2025-01-01');
    expect(dayKey(ts, 'America/Sao_Paulo')).toBe('2024-12-31'); // 23:30 do dia anterior
    expect(localTime(ts, 'America/Sao_Paulo')).toEqual({ hour: 23, minute: 30 });
  });
  it('startOfDay e addDays', () => {
    const s = startOfDay('2025-03-10', 'America/Sao_Paulo');
    expect(dayKey(s, 'America/Sao_Paulo')).toBe('2025-03-10');
    expect(dayKey(s - 1, 'America/Sao_Paulo')).toBe('2025-03-09');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });
});

describe('ofensiva', () => {
  const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
  it('conta dias seguidos e não zera com o dia de hoje ainda aberto', () => {
    const s = computeStreak(days('2025-01-01', 5), '2025-01-06');
    expect(s.streak).toBe(5);
    expect(s.atRisk).toBe(true);
    expect(s.studiedToday).toBe(false);
  });
  it('zera após um dia perdido', () => {
    const s = computeStreak(days('2025-01-01', 5), '2025-01-07');
    expect(s.streak).toBe(0);
    expect(s.atRisk).toBe(false);
  });
  it('congelamento: 7 dias ganham 1, que cobre um dia perdido', () => {
    const studied = [...days('2025-01-01', 7), ...days('2025-01-09', 2)]; // perdeu o dia 08
    const noFreeze = computeStreak(studied, '2025-01-10', false);
    const freeze = computeStreak(studied, '2025-01-10', true);
    expect(noFreeze.streak).toBe(2);
    expect(freeze.streak).toBe(9);
    expect(freeze.freezesUsed).toBe(1);
  });
  it('hoje estudado → sem risco', () => {
    const s = computeStreak(days('2025-01-01', 3), '2025-01-03');
    expect(s.studiedToday).toBe(true);
    expect(s.atRisk).toBe(false);
  });
});

describe('FSRS determinístico', () => {
  const mk = (i: number, rating: 1 | 2 | 3 | 4, ts: number): ReviewRec => ({
    id: `d:${ts}:${i}`, card: 'vprod|n:дом', rating, ts, resp: '', correct: rating > 1 ? 1 : 0, dev: 'd', synced: 0,
  });
  const base = Date.UTC(2025, 0, 1);
  const revs = [mk(0, 3, base), mk(1, 3, base + 600e3), mk(2, 1, base + 86400e3 * 3), mk(3, 4, base + 86400e3 * 4)];
  it('a ordem de chegada das revisões não altera o estado final', () => {
    const a = replayCard('vprod', 'n:дом', revs);
    const b = replayCard('vprod', 'n:дом', [...revs].reverse());
    expect(a).toEqual(b);
    expect(a.fsrs.reps).toBe(4);
    expect(a.fsrs.lapses).toBeGreaterThanOrEqual(0);
    expect(a.due).toBeGreaterThan(base);
  });
});
