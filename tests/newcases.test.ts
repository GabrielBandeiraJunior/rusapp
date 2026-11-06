import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { indexContent } from '../src/lib/content';
import { answerFor, explain, gramKeys } from '../src/lib/grammar';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content;
const ix = indexContent(content);
const NEW = ['dat', 'inst', 'prep'];

describe('dativo, instrumental e preposicional', () => {
  const keys = gramKeys(ix).filter((k) => NEW.includes(k.c));
  const byLemma = new Set(keys.map((k) => k.lemma));

  it('há perguntas dos três casos, para substantivos e adjetivos, nos dois números', () => {
    for (const c of NEW) {
      for (const pos of ['noun', 'adj']) {
        expect(keys.some((k) => k.c === c && ix.lemma.get(k.lemma)!.pos === pos), `${c} ${pos}`).toBe(true);
      }
      expect(keys.some((k) => k.c === c && k.n === 'pl')).toBe(true);
    }
    expect(byLemma.size).toBeGreaterThan(200);
  });

  it('toda pergunta tem resposta vinda dos dados e explicação não vazia', () => {
    for (const k of keys) {
      const ans = answerFor(ix, k);
      expect(ans && ans.length > 0, k.lemma + k.c).toBe(true);
      const lines = explain(ix, k, ans!, '');
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0].length).toBeGreaterThan(10);
    }
  });

  it('a regra regular vale para a grande maioria (exceções são minoria e marcadas)', () => {
    let total = 0, exc = 0;
    for (const k of keys) {
      const lines = explain(ix, k, answerFor(ix, k)!, '').join(' ');
      total++;
      if (/exceção|foge da regra/.test(lines)) exc++;
    }
    expect(exc / total).toBeLessThan(0.25);
  });

  it('o currículo põe substantivos antes dos adjetivos e prep. antes de dat. e inst.', () => {
    const idx = (c: string, pos: string) => keys.findIndex((k) => k.c === c && ix.lemma.get(k.lemma)!.pos === pos && k.n === 'sg');
    expect(idx('prep', 'noun')).toBeLessThan(idx('dat', 'noun'));
    expect(idx('dat', 'noun')).toBeLessThan(idx('inst', 'noun'));
    expect(idx('inst', 'noun')).toBeLessThan(idx('dat', 'adj'));
  });
});
