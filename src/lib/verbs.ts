// Conjugação: o usuário DIGITA a forma verbal; validação contra a tabela `form` (OpenRussian).
// As regras só EXPLICAM terminações e, como em grammar.ts, só aparecem quando a forma real dos dados as cumpre.
import type { Form, Gender, Lemma, Num } from '../../shared/types';
import { syllableCount } from '../../shared/russian';
import type { ContentIndex } from './content';
import { commonPrefix, ruleForm, ruleHolds, syllableOfStress, type EndingRule } from './grammar';

export type Tense = 'presfut' | 'past' | 'imp';
export type Person = '1' | '2' | '3';

export interface VerbKey {
  lemma: string;
  tn: Tense;
  p?: Person;
  n: Num;
  g?: Gender;
}

export function verbRef(k: VerbKey): string {
  return [k.lemma, k.tn, k.p ?? '-', k.n, k.g ?? '-'].join('|');
}

export function parseVerbRef(ref: string): VerbKey {
  const [lemma, tn, p, n, g] = ref.split('|');
  const k: VerbKey = { lemma, tn: tn as Tense, n: n as Num };
  if (p && p !== '-') k.p = p as Person;
  if (g && g !== '-') k.g = g as Gender;
  return k;
}

const STAGE: Record<Tense, number> = { presfut: 1, past: 2, imp: 3 };
/** Ordem dentro do verbo: presente/futuro (eu…eles), passado (m, f, n, pl), imperativo (sg, pl). */
const ORDER = ['presfut|1|sg', 'presfut|2|sg', 'presfut|3|sg', 'presfut|1|pl', 'presfut|2|pl', 'presfut|3|pl',
  'past|-|sg|m', 'past|-|sg|f', 'past|-|sg|n', 'past|-|pl', 'imp|-|sg', 'imp|-|pl'];

function slot(f: Form): string {
  return f.tn === 'past' ? (f.n === 'pl' ? 'past|-|pl' : `past|-|sg|${f.g}`) : f.tn === 'presfut' ? `presfut|${f.p}|${f.n}` : `imp|-|${f.n}`;
}

const cache = new WeakMap<ContentIndex, VerbKey[]>();

/** Todas as perguntas de conjugação, em ordem de currículo e frequência (só formas que existem nos dados). */
export function verbKeys(ix: ContentIndex): VerbKey[] {
  const hit = cache.get(ix);
  if (hit) return hit;
  const out: { k: VerbKey; stage: number; rank: number; ord: number }[] = [];
  for (const l of ix.content.lemmas) {
    if (l.pos !== 'verb') continue;
    const forms = ix.formsOf.get(l.id) ?? [];
    const pres = forms.filter((f) => f.tn === 'presfut');
    // "быть": todas as pessoas têm a mesma forma → exercício sem sentido
    const flatPresent = pres.length > 1 && new Set(pres.map((f) => f.v[0])).size === 1;
    for (const f of forms) {
      if (!f.tn || !f.n) continue;
      if (f.tn === 'presfut' && flatPresent) continue;
      const k: VerbKey = { lemma: l.id, tn: f.tn as Tense, n: f.n };
      if (f.p) k.p = f.p as Person;
      if (f.g) k.g = f.g;
      out.push({ k, stage: STAGE[k.tn], rank: l.r, ord: ORDER.indexOf(slot(f)) });
    }
  }
  const keys = out.sort((a, b) => a.stage - b.stage || a.rank - b.rank || a.ord - b.ord).map((x) => x.k);
  cache.set(ix, keys);
  return keys;
}

export function findVerbForm(ix: ContentIndex, k: VerbKey): Form | undefined {
  return ix.formsOf.get(k.lemma)?.find((f) => f.tn === k.tn && f.n === k.n && (k.p ? f.p === k.p : true) && (k.g ? f.g === k.g : true));
}

export function verbAnswerFor(ix: ContentIndex, k: VerbKey): string[] | null {
  return findVerbForm(ix, k)?.v ?? null;
}

/** Pronomes da pergunta: pt (explicação) e ru (já acentuados — o app nunca mostra russo sem acento). */
const PRON: Record<string, { pt: string; ru: string }> = {
  '1|sg': { pt: 'eu', ru: 'я' }, '2|sg': { pt: 'tu', ru: 'ты' }, '3|sg': { pt: 'ele / ela', ru: 'он / она́ / оно́' },
  '1|pl': { pt: 'nós', ru: 'мы' }, '2|pl': { pt: 'vós / vocês', ru: 'вы' }, '3|pl': { pt: 'eles / elas', ru: 'они́' },
};
const PAST_PRON: Record<string, { pt: string; ru: string }> = {
  m: { pt: 'masculino', ru: 'он' }, f: { pt: 'feminino', ru: 'она́' }, n: { pt: 'neutro', ru: 'оно́' }, pl: { pt: 'plural', ru: 'они́' },
};

export function promptVerb(ix: ContentIndex, k: VerbKey): { lemma: Lemma; tense: string; ru: string } {
  const lemma = ix.lemma.get(k.lemma)!;
  if (k.tn === 'presfut') {
    const p = PRON[`${k.p}|${k.n}`];
    return { lemma, tense: `${lemma.asp === 'pf' ? 'futuro (perfectivo)' : 'presente'} · ${p.pt}`, ru: p.ru };
  }
  if (k.tn === 'past') {
    const p = PAST_PRON[k.n === 'pl' ? 'pl' : k.g!];
    return { lemma, tense: `passado · ${p.pt}`, ru: p.ru };
  }
  return { lemma, tense: `imperativo · ${k.n === 'pl' ? 'vós / vocês' : 'tu'}`, ru: k.n === 'pl' ? 'вы' : 'ты' };
}

// ---------- explicações ----------
const R = (text: string, re?: RegExp): EndingRule => ({ text, re });

const CONJ1: Record<string, EndingRule> = {
  '1|sg': R('1ª conjugação — eu: -у (-ю depois de vogal).', /(у|ю)$/),
  '2|sg': R('1ª conjugação — tu: -ешь (-ёшь se a tônica cai na terminação).', /ешь$/),
  '3|sg': R('1ª conjugação — ele/ela: -ет (-ёт se tônico).', /ет$/),
  '1|pl': R('1ª conjugação — nós: -ем (-ём se tônico).', /ем$/),
  '2|pl': R('1ª conjugação — vós/vocês: -ете (-ёте se tônico).', /ете$/),
  '3|pl': R('1ª conjugação — eles/elas: -ут (-ют depois de vogal).', /(ут|ют)$/),
};
const CONJ2: Record<string, EndingRule> = {
  '1|sg': R('2ª conjugação — eu: -у (-ю depois de vogal).', /(у|ю)$/),
  '2|sg': R('2ª conjugação — tu: -ишь.', /ишь$/),
  '3|sg': R('2ª conjugação — ele/ela: -ит.', /ит$/),
  '1|pl': R('2ª conjugação — nós: -им.', /им$/),
  '2|pl': R('2ª conjugação — vós/vocês: -ите.', /ите$/),
  '3|pl': R('2ª conjugação — eles/elas: -ат (-ят depois de vogal ou radical mole).', /(ат|ят)$/),
};
const PAST: Record<string, EndingRule> = {
  m: R('Passado: tira-se -ть do infinitivo e põe-se -л (masculino). O passado concorda com o gênero, não com a pessoa.', /л$/),
  f: R('Passado: tira-se -ть do infinitivo e põe-se -ла (feminino).', /ла$/),
  n: R('Passado: tira-se -ть do infinitivo e põe-se -ло (neutro).', /ло$/),
  pl: R('Passado: tira-se -ть do infinitivo e põe-se -ли (plural, para todas as pessoas).', /ли$/),
};
const IMP: Record<string, EndingRule> = {
  sg: R('Imperativo (ты): -и (se a tônica cai na terminação) ou -ь/-й (radical terminado em vogal ou tônica no radical).', /(и|ь|й)$/),
  pl: R('Imperativo (вы): a forma do ты + -те.', /те$/),
};

export const IRREGULAR_VERB = 'Forma irregular: memorize esta forma.';

/** Classe de conjugação lida dos DADOS (forma de "tu"): 1, 2 ou undefined (irregular). */
export function conjugationOf(ix: ContentIndex, lemmaId: string): 1 | 2 | undefined {
  const f = ix.formsOf.get(lemmaId)?.find((x) => x.tn === 'presfut' && x.p === '2' && x.n === 'sg');
  if (!f) return undefined;
  const w = f.v.map(ruleForm);
  return w.some((s) => s.endsWith('ешь')) ? 1 : w.some((s) => s.endsWith('ишь')) ? 2 : undefined;
}

export function verbRule(ix: ContentIndex, k: VerbKey): EndingRule | undefined {
  if (k.tn === 'presfut') {
    const c = conjugationOf(ix, k.lemma);
    return c ? (c === 1 ? CONJ1 : CONJ2)[`${k.p}|${k.n}`] : undefined;
  }
  if (k.tn === 'past') return PAST[k.n === 'pl' ? 'pl' : k.g!];
  return IMP[k.n];
}

export function explainVerb(ix: ContentIndex, k: VerbKey, variants: string[]): string[] {
  const l = ix.lemma.get(k.lemma)!;
  const lines: string[] = [];
  const rule = verbRule(ix, k);
  lines.push(rule && ruleHolds(rule, variants) ? rule.text : IRREGULAR_VERB);
  if (k.tn === 'presfut' && l.asp === 'pf') lines.push('Verbo perfectivo: não tem presente; esta mesma forma indica o futuro simples.');
  const correct = variants[0];
  if (k.tn === 'presfut') {
    // mutação do radical, detectada por comparação com o infinitivo (não gera forma)
    const stem = l.t.replace(/(ться|ть|ти|чь)$/, '');
    const target = ruleForm(correct);
    const p = commonPrefix(stem.toLowerCase().replace(/ё/g, 'е'), target);
    if (stem.length >= 3 && p < stem.length - 1) lines.push(`O radical muda (alternância de consoante ou vogal): ${l.s} → ${correct}.`);
  }
  const s1 = syllableOfStress(l.s), s2 = syllableOfStress(correct);
  if (syllableCount(correct) > 1 && s1 > 0 && s2 > 0 && s1 !== s2) lines.push(`O acento muda de sílaba (${s1}ª → ${s2}ª): ${correct}.`);
  if (variants.length > 1) lines.push(`Variantes aceitas: ${variants.join(', ')}.`);
  return lines;
}
