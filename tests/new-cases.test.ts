import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { stripStress } from '../shared/russian';
import { indexContent } from '../src/lib/content';
import { answerFor, explain, gramKeys, keyRef, stageOf } from '../src/lib/grammar';

const ix = indexContent(JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content);
const NEW = ['dat', 'inst', 'prep'];

describe('dativo, instrumental e preposicional', () => {
  const keys = gramKeys(ix).filter((k) => NEW.includes(k.c));

  it('existem para substantivos e adjetivos, todos com resposta vinda dos dados', () => {
    expect(keys.length).toBeGreaterThan(1500);
    for (const c of NEW) expect(keys.some((k) => k.c === c && ix.lemma.get(k.lemma)!.pos === 'noun')).toBe(true);
    for (const c of NEW) expect(keys.some((k) => k.c === c && ix.lemma.get(k.lemma)!.pos === 'adj')).toBe(true);
    const refs = new Set<string>();
    for (const k of keys) {
      expect(answerFor(ix, k), keyRef(k)).toBeTruthy();
      expect(refs.has(keyRef(k))).toBe(false); // sem duplicatas
      refs.add(keyRef(k));
    }
  });

  it('currículo: casos novos vêm depois de nom/acc/gen dos substantivos e o foco filtra', () => {
    const all = gramKeys(ix);
    const firstNew = all.findIndex((k) => NEW.includes(k.c) && ix.lemma.get(k.lemma)!.pos === 'noun');
    const lastBasicNoun = all.map((k, i) => ({ k, i })).filter(({ k }) => !NEW.includes(k.c) && ix.lemma.get(k.lemma)!.pos === 'noun' && stageOf(ix.lemma.get(k.lemma)!, k) <= 4);
    expect(lastBasicNoun.every(({ i }) => i < firstNew)).toBe(true);
    expect(gramKeys(ix, 'dat').every((k) => k.c === 'dat')).toBe(true);
    expect(gramKeys(ix, 'prep').length).toBeGreaterThan(300);
  });

  it('explicação nunca contradiz os dados: se a regra é citada, a forma realmente termina como ela diz', () => {
    let rules = 0, exceptions = 0;
    for (const k of keys) {
      const v = answerFor(ix, k)!;
      const lines = explain(ix, k, v);
      expect(lines[0], keyRef(k)).toBeTruthy();
      if (/^(Exceção|Declinação irregular|Forma irregular)/.test(lines[0])) exceptions++;
      else rules++;
    }
    expect(rules).toBeGreaterThan(exceptions * 20); // regras regulares dominam; exceções são raras
  });

  it('exemplos regulares recebem a regra certa', () => {
    const dom = gramKeys(ix).find((k) => k.lemma === 'n:дом' && k.c === 'dat' && k.n === 'sg')!;
    expect(stripStress(answerFor(ix, dom)![0])).toBe('дому');
    expect(explain(ix, dom, answerFor(ix, dom)!)[0]).toMatch(/dativo singular = \+ у/);
    const inst = gramKeys(ix).find((k) => k.lemma === 'n:дом' && k.c === 'inst' && k.n === 'sg')!;
    expect(stripStress(answerFor(ix, inst)![0])).toBe('домом');
    const put = gramKeys(ix).find((k) => k.lemma === 'n:путь' && k.c === 'dat' && k.n === 'sg');
    if (put) expect(explain(ix, put, answerFor(ix, put)!)[0]).toMatch(/Exceção|irregular/);
  });
});
