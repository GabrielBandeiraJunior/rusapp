import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { phonetic } from '../shared/russian';
import { splitRich } from '../src/lib/alphabet';
import { indexContent } from '../src/lib/content';
import { buildQueue, dueItems, knownLemmas, newItems, newToday } from '../src/lib/queue';
import { distractors, hash } from '../src/lib/readex';
import { band, coverageOf, rankTexts, textCoverage } from '../src/lib/reading';
import { clearSession, loadSession, saveSession, type SavedSession } from '../src/lib/resume';
import { replayCard, type CardRec, type ReviewRec } from '../src/lib/srs';
import { dueNow, dueToday, errorsByCase, matureCount, retention, reviewsOnDay, streakFor, studyDays, type Settings } from '../src/lib/stats';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content;
const ix = indexContent(content);
const TZ = 'America/Sao_Paulo';
const T0 = Date.UTC(2025, 5, 10, 15); // 12:00 em São Paulo
const DAY = 86400e3;

let n = 0;
const rev = (card: string, ts: number, rating: 1 | 2 | 3 | 4 = 3): ReviewRec => ({
  id: `t:${ts}:${n++}`, card, rating, ts, resp: '', correct: rating > 1 ? 1 : 0, dev: 't', synced: 0,
});
function cardsFrom(reviews: ReviewRec[]): CardRec[] {
  const by = new Map<string, ReviewRec[]>();
  for (const r of reviews) by.set(r.card, [...(by.get(r.card) ?? []), r]);
  return [...by].map(([id, rs]) => {
    const i = id.indexOf('|');
    return replayCard(id.slice(0, i) as CardRec['kind'], id.slice(i + 1), rs);
  });
}
const settings: Settings = { dailyGoal: 20, newPerDay: 5, tz: TZ, freeze: false };

describe('filas (queue)', () => {
  it('novos respeitam o orçamento por dia e o tipo; devidos vêm primeiro', () => {
    const q0 = buildQueue(ix, [], [], 'vprod', T0, { newPerDay: 5, tz: TZ });
    expect(q0).toHaveLength(5);
    expect(q0.every((i) => i.isNew && i.kind === 'vprod')).toBe(true);
    expect(q0[0].ref).toBe(content.lemmas[0].id); // por frequência
    // estuda 3 hoje → sobram 2 no orçamento
    const rs = q0.slice(0, 3).map((i, k) => rev(i.cardId, T0 + k * 1000));
    expect(newToday(rs, 'vprod', TZ, T0 + 5000)).toBe(3);
    expect(newToday(rs, 'gram', TZ, T0 + 5000)).toBe(0);
    const q1 = buildQueue(ix, cardsFrom(rs), rs, 'vprod', T0 + 5000, { newPerDay: 5, tz: TZ });
    expect(q1).toHaveLength(2);
    // amanhã: 3 cartões devidos (ordem por vencimento) + 5 novos
    const q2 = buildQueue(ix, cardsFrom(rs), rs, 'vprod', T0 + 3 * DAY, { newPerDay: 5, tz: TZ });
    expect(q2.filter((i) => !i.isNew)).toHaveLength(3);
    expect(q2.slice(0, 3).every((i) => !i.isNew)).toBe(true);
    expect(q2.filter((i) => i.isNew)).toHaveLength(5);
  });
  it('vrec e stress só liberam lemas que o aluno já digitou (vprod); stress e leitura exigem ≥ 2 sílabas', () => {
    expect(newItems(ix, [], 'vrec', 10)).toHaveLength(0);
    expect(newItems(ix, [], 'stress', 10)).toHaveLength(0);
    const polys = content.lemmas.find((l) => l.t.length > 3 && l.s !== l.t)!;
    const mono = content.lemmas.find((l) => /^[^аеёиоуыэюя]*[аеёиоуыэюя][^аеёиоуыэюя]*$/.test(l.t))!;
    const cards = cardsFrom([rev(`vprod|${polys.id}`, T0), rev(`vprod|${mono.id}`, T0)]);
    expect(newItems(ix, cards, 'vrec', 50).map((i) => i.ref).sort()).toEqual([mono.id, polys.id].sort());
    const st = newItems(ix, cards, 'stress', 50).map((i) => i.ref);
    expect(st).toContain(polys.id);
    expect(st).not.toContain(mono.id);
    expect(newItems(ix, [], 'read', 3).every((i) => i.kind === 'read')).toBe(true);
  });
  it('gram e verb seguem o currículo e não repetem cartões já criados', () => {
    const g = newItems(ix, [], 'gram', 3);
    expect(g).toHaveLength(3);
    const cards = cardsFrom([rev(g[0].cardId, T0)]);
    expect(newItems(ix, cards, 'gram', 3).map((i) => i.ref)).not.toContain(g[0].ref);
    const v = newItems(ix, [], 'verb', 6);
    expect(v.map((i) => i.ref.split('|').slice(1, 4).join('|'))).toEqual(['presfut|1|sg', 'presfut|2|sg', 'presfut|3|sg', 'presfut|1|pl', 'presfut|2|pl', 'presfut|3|pl']);
  });
  it('acento de formas flexionadas só aparece para lemas já estudados', () => {
    const l = content.lemmas.find((x) => x.id === 'n:дом')!;
    const base = cardsFrom([rev(`vprod|${l.id}`, T0), rev(`stress|${l.id}`, T0)]);
    const forms = newItems(ix, base, 'stress', 500).filter((i) => i.ref.includes('|'));
    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((i) => i.ref.startsWith(`${l.id}|`))).toBe(true);
    expect(newItems(ix, [], 'stress', 500)).toHaveLength(0);
  });
  it('dueItems e knownLemmas', () => {
    const cards = cardsFrom([rev('vprod|n:дом', T0), rev('vrec|n:вода', T0), rev('stress|n:мир', T0), rev('gram|n:дом|gen|sg|-|-', T0)]);
    expect([...knownLemmas(cards)].sort()).toEqual(['n:вода', 'n:дом']);
    expect(dueItems(cards, ['vprod'], T0 + 10 * DAY)).toHaveLength(1);
    expect(dueItems(cards, ['vprod'], T0)).toHaveLength(0);
  });
});

describe('estatísticas', () => {
  it('dias estudados respeitam o fuso; ofensiva; revisões por dia', () => {
    const rs = [rev('vprod|a', Date.UTC(2025, 5, 10, 2)), rev('vprod|a', Date.UTC(2025, 5, 10, 14)), rev('vprod|b', Date.UTC(2025, 5, 11, 14))];
    expect([...studyDays(rs, TZ)].sort()).toEqual(['2025-06-09', '2025-06-10', '2025-06-11']); // 02:00Z ainda é o dia 09 em SP
    expect(reviewsOnDay(rs, '2025-06-10', TZ)).toBe(1);
    const s = streakFor(rs, Date.UTC(2025, 5, 11, 20), settings);
    expect(s.streak).toBe(3);
    expect(s.studiedToday).toBe(true);
  });
  it('retenção ignora a 1ª exposição e janela de 30 dias', () => {
    const rs = [rev('c|1', T0, 3), rev('c|1', T0 + DAY, 3), rev('c|1', T0 + 2 * DAY, 1), rev('c|2', T0, 1)];
    const r = retention(rs, T0 + 3 * DAY);
    expect(r).toEqual({ pct: 50, n: 2 });
    expect(retention([], T0)).toEqual({ pct: null, n: 0 });
    expect(retention(rs, T0 + 90 * DAY).n).toBe(0);
  });
  it('erros por caso só contam cartões gram', () => {
    const rs = [
      rev('gram|n:дом|gen|sg|-|-', T0, 1), rev('gram|n:дом|gen|sg|-|-', T0 + 1, 3), rev('gram|n:вода|dat|pl|-|-', T0, 3),
      rev('vprod|n:дом', T0, 1),
    ];
    const rows = errorsByCase(rs);
    expect(rows.map((r) => r.label).sort()).toEqual(['Dativo plural', 'Genitivo singular']);
    expect(rows.find((r) => r.label === 'Genitivo singular')).toMatchObject({ total: 2, wrong: 1 });
  });
  it('devidos hoje / agora e cartões maduros', () => {
    const rs = [rev('vprod|a', T0), rev('vprod|b', T0 + 1)];
    const cards = cardsFrom(rs);
    expect(dueNow(cards, T0 + 3 * DAY)).toHaveLength(2);
    expect(dueNow(cards, T0)).toHaveLength(0);
    expect(dueToday(cards, T0, TZ).length).toBeLessThanOrEqual(2);
    expect(matureCount(cards)).toBe(0);
    let long = [rev('vprod|m', T0)];
    for (let i = 1; i < 9; i++) long = [...long, rev('vprod|m', T0 + i * 20 * DAY, 4)];
    expect(matureCount(cardsFrom(long))).toBe(1);
  });
});

describe('retomada de sessão (localStorage)', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    } as Storage;
  });
  const sess = (idx: number, ts: number): SavedSession => ({
    kind: 'verb', queue: [1, 2, 3].map((i) => ({ cardId: `verb|x${i}`, kind: 'verb' as const, ref: `x${i}`, isNew: true })), idx, stats: { ok: 1, bad: 0 }, ts,
  });
  it('salva, carrega, limpa; ignora posição inicial/final e sessões velhas', () => {
    expect(loadSession(T0)).toBeNull();
    saveSession(sess(1, T0));
    expect(loadSession(T0 + 1000)?.idx).toBe(1);
    expect(loadSession(T0 + 40 * 3600e3)).toBeNull(); // > 36 h
    saveSession(sess(0, T0));
    expect(loadSession(T0)).toBeNull();
    saveSession(sess(3, T0));
    expect(loadSession(T0)).toBeNull();
    saveSession(sess(2, T0));
    clearSession();
    expect(loadSession(T0)).toBeNull();
  });
  it('JSON corrompido não quebra', () => {
    store.set('russo.resume', '{nao-json');
    expect(loadSession(T0)).toBeNull();
  });
});

describe('leitura graduada', () => {
  it('cobertura, faixa ideal e ranking de textos', () => {
    const t = content.texts[0];
    const all = new Set(content.lemmas.map((l) => l.id));
    expect(textCoverage(ix, t, all).pct).toBe(100);
    expect(textCoverage(ix, t, new Set()).pct).toBe(0);
    expect(band(100)).toBe('facil');
    expect(band(96)).toBe('ideal');
    expect(band(80)).toBe('dificil');
    expect(coverageOf([], new Set())).toMatchObject({ words: 0, pct: 0 });
    const r = rankTexts(ix, all);
    expect(r).toHaveLength(content.texts.length);
  });
});

describe('alfabeto / leitura de palavras', () => {
  it('splitRich separa texto, palavra e leitura', () => {
    expect(splitRich('a {{n:дом}} b [{{p:n:дом}}]')).toEqual([
      { t: 'text', v: 'a ' }, { t: 'word', v: 'n:дом' }, { t: 'text', v: ' b [' }, { t: 'read', v: 'n:дом' }, { t: 'text', v: ']' },
    ]);
  });
  it('distratores são distintos, estáveis e nunca iguais à resposta', () => {
    const d = distractors('moloko', 7);
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    expect(d).not.toContain('moloko');
    expect(distractors('moloko', 7)).toEqual(d);
    expect(hash('a')).toBe(hash('a'));
    expect(hash('a')).not.toBe(hash('b'));
  });
  it('leitura: exceções lexicais frequentes e -тся/-ться', () => {
    expect(phonetic('что')).toBe('shto');
    expect(phonetic('конечно')).toContain('shn');
    expect(phonetic('сего́дня')).toContain('v');
    expect(phonetic('учи́ться')).toMatch(/tsa$/);
    expect(phonetic('нра́вится')).toMatch(/tsa$/);
  });
});
