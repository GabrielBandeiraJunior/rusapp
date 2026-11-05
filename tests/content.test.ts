import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { ACUTE, cyrillicTokens, syllableCount, wordHasRequiredStress } from '../shared/russian';
import { indexContent } from '../src/lib/content';
import { answerFor, checkAnswer, gramKeys, keyRef, parseRef, explain, promptFor } from '../src/lib/grammar';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content;
const ix = indexContent(content);

// ---- parser INDEPENDENTE do snapshot de origem (não reutiliza o código do pipeline)
function tsv(path: string) {
  const [head, ...lines] = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const cols = head.split('\t');
  return lines.map((l) => Object.fromEntries(l.split('\t').map((c, i) => [cols[i], c])));
}
function accent(cell: string): string[] {
  return cell.split(/\s*,\s*/).map((v) => {
    const w = v.replace(/([аеёиоуыэюя])'/g, `$1${ACUTE}`);
    return syllableCount(w) <= 1 ? w.replace(new RegExp(ACUTE, 'g'), '') : w;
  });
}
const srcNouns = tsv('data/source/nouns.tsv');
const srcAdjs = tsv('data/source/adjectives.tsv');

describe('critérios de aceite — dados', () => {
  const gramNouns = content.lemmas.filter((l) => l.pos === 'noun' && l.gram);
  const gramAdjs = content.lemmas.filter((l) => l.pos === 'adj' && l.gram);

  it('amostra de ≥200 substantivos/adjetivos', () => {
    expect(gramNouns.length + gramAdjs.length).toBeGreaterThanOrEqual(200);
  });

  it('substantivos: TODAS as formas aceitas pelo app == dados de origem (nom/gen/acc × sg/pl)', () => {
    let checked = 0;
    for (const l of gramNouns) {
      const row = srcNouns.find((r) => r.bare === l.t && accent(r.accented)[0] === l.s)!;
      expect(row, l.id).toBeTruthy();
      const nums = l.plo ? ['pl'] : l.sgo ? ['sg'] : ['sg', 'pl'];
      for (const k of gramKeys(ix).filter((g) => g.lemma === l.id)) {
        expect(nums).toContain(k.n);
        const expected = accent(row[`${k.n}_${k.c}`]);
        const got = answerFor(ix, k)!;
        expect(got, `${l.id} ${keyRef(k)}`).toEqual(expected);
        for (const e of expected) {
          expect(checkAnswer(e, got)).toBe(true);
          expect(checkAnswer(e.replace(new RegExp(ACUTE, 'g'), '').toUpperCase(), got)).toBe(true); // sem acento, caixa alta
        }
        expect(checkAnswer(expected[0] + 'ь', got)).toBe(false); // exato nas letras
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  it('adjetivos: formas idênticas aos dados; acusativo = nominativo (inan.) ou genitivo (anim.)', () => {
    let checked = 0;
    for (const l of gramAdjs) {
      const row = srcAdjs.find((r) => r.bare === l.t && accent(r.accented)[0] === l.s)!;
      expect(row, l.id).toBeTruthy();
      for (const k of gramKeys(ix).filter((g) => g.lemma === l.id)) {
        const gcol = k.n === 'pl' ? 'pl' : k.g!;
        const got = answerFor(ix, k)!;
        if (k.c === 'acc' && (k.g === 'm' || k.n === 'pl')) {
          const nom = accent(row[`decl_${gcol}_nom`]), gen = accent(row[`decl_${gcol}_gen`]);
          expect(got).toEqual(k.an === 'anim' ? gen : nom);
          const cell = accent(row[`decl_${gcol}_acc`]);
          for (const v of got) expect(cell).toContain(v);
        } else expect(got, `${l.id} ${keyRef(k)}`).toEqual(accent(row[`decl_${gcol}_${k.c}`]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(600);
  });

  it('toda forma do app rastreia uma coluna do snapshot de origem (nenhuma forma inventada)', () => {
    const rowsByLemma = (l: string) => {
      const lem = ix.lemma.get(l)!;
      const src = lem.pos === 'noun' ? srcNouns : lem.pos === 'adj' ? srcAdjs : tsv('data/source/verbs.tsv');
      return src.find((r) => r.bare === lem.t && accent(r.accented)[0] === lem.s)!;
    };
    for (const f of content.forms) {
      const row = rowsByLemma(f.l);
      expect(row, f.id).toBeTruthy();
      const col = f.id.split('|')[1];
      const cell = accent(row[col]);
      for (const v of f.v) expect(cell, f.id).toContain(v);
    }
  });

  it('nenhuma palavra russa sem acento (exceto monossílabos) em lemas, formas e frases', () => {
    const bad: string[] = [];
    const check = (w: string, where: string) => {
      if (!wordHasRequiredStress(w)) bad.push(`${where}: ${w}`);
    };
    for (const l of content.lemmas) check(l.s, l.id);
    for (const f of content.forms) f.v.forEach((v) => check(v, f.id));
    for (const s of content.sentences) cyrillicTokens(s.ru).forEach((t) => check(t, s.id));
    expect(bad).toEqual([]);
  });

  it('lemas: acento do lema coincide com o texto; ids únicos; ranks 1..N', () => {
    const ids = new Set(content.lemmas.map((l) => l.id));
    expect(ids.size).toBe(content.lemmas.length);
    content.lemmas.forEach((l, i) => {
      expect(l.r).toBe(i + 1);
      expect(l.s.normalize('NFC').split(ACUTE).join('')).toBe(l.t);
      expect(l.pt.length).toBeGreaterThan(0);
    });
  });

  it('frases: cada token com lema aponta para um lema existente; texto = tokens', () => {
    expect(content.sentences.length).toBeGreaterThanOrEqual(60);
    for (const s of content.sentences) {
      for (const [, l] of s.tk) if (l) expect(ix.lemma.has(l), `${s.id} ${l}`).toBe(true);
      expect(s.tk.map((t, i) => (i && t[2] ? ' ' : '') + t[0]).join('')).toBe(s.ru);
      expect(s.pt.length).toBeGreaterThan(2);
    }
  });
});

describe('gramática: currículo e explicações', () => {
  it('chaves ida-e-volta; todas têm resposta; foco filtra', () => {
    const keys = gramKeys(ix);
    expect(keys.length).toBeGreaterThan(1000);
    for (const k of keys) {
      expect(parseRef(keyRef(k))).toEqual(k);
      expect(answerFor(ix, k), keyRef(k)).toBeTruthy();
    }
    expect(gramKeys(ix, 'gen').every((k) => k.c === 'gen')).toBe(true);
  });
  it('explica regras e detecta mutações', () => {
    const k = { lemma: 'n:книга', c: 'gen' as const, n: 'pl' as const };
    const v = answerFor(ix, k)!;
    const text = explain(ix, k, v).join(' ');
    expect(text).toMatch(/zero/);
    const kk = { lemma: 'n:человек', c: 'nom' as const, n: 'pl' as const };
    expect(explain(ix, kk, answerFor(ix, kk)!).join(' ')).toMatch(/irregular/i);
    expect(promptFor(ix, kk).line).toBe('nominativo · plural');
  });
  it('dica da regra ortográfica ы/и', () => {
    const k = { lemma: 'n:книга', c: 'gen' as const, n: 'sg' as const };
    expect(explain(ix, k, answerFor(ix, k)!, 'книгы').join(' ')).toMatch(/nunca se escreve ы/);
  });
});

describe('UI: explicações nunca exibem palavra russa sem acento', () => {
  it('todas as explicações de todas as perguntas', () => {
    const bad = new Set<string>();
    const V = 'аеёиоуыэюя';
    for (const k of gramKeys(ix)) {
      const v = answerFor(ix, k)!;
      for (const line of [...explain(ix, k, v), ...explain(ix, k, v, 'ъъъ')]) {
        const re = /[Ѐ-ӿ́]+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) {
          const t = m[0];
          const prev = line[m.index - 1] ?? '';
          const nv = [...t].filter((c) => V.includes(c.toLowerCase())).length;
          if (nv < 2 || t.includes('́') || t.includes('ё') || '-+/(→'.includes(prev) || line[m.index + t.length] === '-') continue;
          bad.add(t);
        }
      }
    }
    expect([...bad]).toEqual([]);
  });
});
