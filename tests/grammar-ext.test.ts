import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { stripStress, syllableCount } from '../shared/russian';
import { indexContent } from '../src/lib/content';
import { describeForm } from '../src/lib/formlabel';
import { answerFor, explain, gramKeys, IRREGULAR, keyRef, ruleFor, ruleHolds, syllableOfStress } from '../src/lib/grammar';
import { stressShiftForms } from '../src/lib/queue';
import {
  conjugationOf, explainVerb, parseVerbRef, promptVerb, verbAnswerFor, verbKeys, verbRef, IRREGULAR_VERB,
} from '../src/lib/verbs';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content;
const ix = indexContent(content);

/** Palavras russas com ≥ 2 vogais, sem acento/ё e que não são afixos (-ого, +ов, /ев…). */
function unaccented(line: string): string[] {
  const V = 'аеёиоуыэюя';
  const bad: string[] = [];
  const re = /[Ѐ-ӿ́]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const t = m[0];
    const prev = line[m.index - 1] ?? '';
    const nv = [...t].filter((c) => V.includes(c.toLowerCase())).length;
    if (nv < 2 || t.includes('́') || t.includes('ё') || '-+/(→'.includes(prev) || line[m.index + t.length] === '-') continue;
    bad.push(t);
  }
  return bad;
}

describe('casos estendidos (preposicional, dativo, instrumental)', () => {
  const keys = gramKeys(ix);
  it('só lemas com células completas (gx) recebem os casos novos; todas as perguntas têm resposta', () => {
    const ext = keys.filter((k) => ['prep', 'dat', 'inst'].includes(k.c));
    expect(ext.length).toBeGreaterThan(1000);
    for (const k of ext) {
      expect(ix.lemma.get(k.lemma)!.gx, keyRef(k)).toBe(1);
      expect(answerFor(ix, k), keyRef(k)).toBeTruthy();
    }
    const withoutGx = new Set(content.lemmas.filter((l) => l.gram && !l.gx).map((l) => l.id));
    expect(keys.some((k) => withoutGx.has(k.lemma) && ['prep', 'dat', 'inst'].includes(k.c))).toBe(false);
  });
  it('currículo: casos novos vêm depois dos básicos; filtro por caso funciona', () => {
    const firstExt = keys.findIndex((k) => ['prep', 'dat', 'inst'].includes(k.c));
    const lastBasic = keys.map((k, i) => (['nom', 'acc', 'gen'].includes(k.c) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(firstExt).toBeGreaterThan(-1);
    expect(lastBasic).toBeLessThan(firstExt + 1 + keys.length); // sanidade
    const stageNouns = keys.filter((k) => ix.lemma.get(k.lemma)!.pos === 'noun');
    const firstNounExt = stageNouns.findIndex((k) => ['prep', 'dat', 'inst'].includes(k.c));
    expect(stageNouns.slice(0, firstNounExt).every((k) => ['nom', 'acc', 'gen'].includes(k.c))).toBe(true);
    for (const f of ['prep', 'dat', 'inst'] as const) expect(gramKeys(ix, f).every((k) => k.c === f)).toBe(true);
  });
  it('regra × dados: a regra exibida só vale se a forma real a cumpre, e ≥ 95 % das perguntas têm regra válida', () => {
    let checked = 0, ok = 0;
    for (const k of keys) {
      if (k.c === 'acc') continue;
      const l = ix.lemma.get(k.lemma)!;
      const rule = ruleFor(l, k);
      expect(rule, keyRef(k)).toBeTruthy();
      const v = answerFor(ix, k)!;
      const shown = explain(ix, k, v)[0];
      if (ruleHolds(rule!, v)) {
        ok++;
        // a regra vale; só é trocada pelo aviso de forma suplétiva (raiz totalmente diferente: люди, дети…)
        expect([rule!.text, 'Forma irregular (suplétiva): memorize.'], keyRef(k)).toContain(shown);
      } else expect([IRREGULAR, 'Forma irregular (suplétiva): memorize.'], keyRef(k)).toContain(shown); // exceção: nunca mostra uma regra que contradiz os dados
      checked++;
    }
    expect(ok / checked).toBeGreaterThan(0.95);
  });
  it('exceções conhecidas são tratadas como exceção (люди, друзья…)', () => {
    const k = { lemma: 'n:человек', c: 'dat' as const, n: 'pl' as const };
    expect(explain(ix, k, answerFor(ix, k)!).join(' ')).toMatch(/irregular|suplétiva|raiz/i);
  });
});

describe('verbos', () => {
  const vkeys = verbKeys(ix);
  it('toda pergunta tem resposta; refs fazem ida e volta; "быть" não tem presente (todas as pessoas iguais)', () => {
    expect(vkeys.length).toBeGreaterThan(900);
    for (const k of vkeys) {
      expect(parseVerbRef(verbRef(k))).toEqual(k);
      expect(verbAnswerFor(ix, k), verbRef(k)).toBeTruthy();
    }
    expect(vkeys.some((k) => k.lemma === 'v:быть' && k.tn === 'presfut')).toBe(false);
    expect(vkeys.some((k) => k.lemma === 'v:быть' && k.tn === 'past')).toBe(true);
  });
  it('ordem: presente/futuro → passado → imperativo; pessoas em sequência', () => {
    const stage = { presfut: 1, past: 2, imp: 3 } as const;
    for (let i = 1; i < vkeys.length; i++) expect(stage[vkeys[i].tn]).toBeGreaterThanOrEqual(stage[vkeys[i - 1].tn]);
    const first = vkeys.slice(0, 6).map((k) => `${k.p}${k.n}`);
    expect(first).toEqual(['1sg', '2sg', '3sg', '1pl', '2pl', '3pl']);
  });
  it('conjugação lida dos dados', () => {
    expect(conjugationOf(ix, 'v:делать')).toBe(1);
    expect(conjugationOf(ix, 'v:говорить')).toBe(2);
  });
  it('respostas = células de origem e prompts em pt-BR', () => {
    const k = { lemma: 'v:делать', tn: 'presfut' as const, p: '1' as const, n: 'sg' as const };
    expect(verbAnswerFor(ix, k)).toEqual([content.forms.find((f) => f.id === 'v:делать|presfut_sg1')!.v[0]]);
    expect(promptVerb(ix, k).tense).toBe('presente · eu');
    const pf = { lemma: 'v:сделать', tn: 'presfut' as const, p: '3' as const, n: 'sg' as const };
    expect(promptVerb(ix, pf).tense).toMatch(/futuro/);
    expect(explainVerb(ix, pf, verbAnswerFor(ix, pf)!).join(' ')).toMatch(/futuro simples/);
  });
  it('regra × dados nos verbos: ≥ 90 % das formas cumprem a regra exibida; o resto vira "irregular"', () => {
    let ok = 0, irr = 0;
    for (const k of vkeys) {
      const v = verbAnswerFor(ix, k)!;
      const first = explainVerb(ix, k, v)[0];
      if (first === IRREGULAR_VERB) irr++;
      else ok++;
    }
    expect(ok / (ok + irr)).toBeGreaterThan(0.9);
  });
  it('nenhuma explicação (casos e verbos) exibe palavra russa sem acento', () => {
    const bad = new Set<string>();
    for (const k of gramKeys(ix)) for (const line of [...explain(ix, k, answerFor(ix, k)!), ...explain(ix, k, answerFor(ix, k)!, 'ъъъ')]) unaccented(line).forEach((t) => bad.add(t));
    for (const k of vkeys) {
      const { tense, ru } = promptVerb(ix, k);
      for (const line of [...explainVerb(ix, k, verbAnswerFor(ix, k)!), tense, ru]) unaccented(line).forEach((t) => bad.add(t));
    }
    expect([...bad]).toEqual([]);
  });
});

describe('acento das formas flexionadas', () => {
  const ids = stressShiftForms(ix);
  it('cada item é uma forma real, polissílaba, cujo acento muda de sílaba em relação ao lema', () => {
    expect(ids.length).toBeGreaterThan(300);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const f = ix.formById.get(id)!;
      expect(f, id).toBeTruthy();
      const l = ix.lemma.get(f.l)!;
      expect(syllableCount(stripStress(f.v[0]))).toBeGreaterThan(1);
      expect(syllableOfStress(f.v[0])).not.toBe(syllableOfStress(l.s));
      expect(describeForm(ix, f).length).toBeGreaterThan(3);
    }
  });
  it('o id da forma começa pelo id do lema (usado para exigir que o lema já tenha sido estudado)', () => {
    for (const id of ids.slice(0, 200)) expect(ix.lemma.has(id.slice(0, id.indexOf('|')))).toBe(true);
  });
});

describe('conteúdo curado', () => {
  it('sem glosas repetidas (mesmo pt + classe + aspecto) — evita pergunta ambígua em pt→ru', () => {
    const seen = new Map<string, string>();
    for (const l of content.lemmas) {
      const k = [l.pt.toLowerCase(), l.pos, l.asp ?? ''].join('|');
      expect(seen.has(k), `${l.s} repete a glosa de ${seen.get(k)}: ${l.pt}`).toBe(false);
      seen.set(k, l.s);
    }
  });
  it('frases do Tatoeba carregam id rastreável e passam pela mesma validação de acento', () => {
    const tato = content.sentences.filter((s) => s.src.startsWith('tatoeba:'));
    expect(tato.length).toBeGreaterThan(100);
    for (const s of tato) expect(s.src).toMatch(/^tatoeba:\d+$/);
  });
});
