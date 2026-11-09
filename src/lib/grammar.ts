// Gramática gerativa: o usuário DIGITA a forma; validação contra a tabela `form` (dados do OpenRussian).
// As regras aqui só EXPLICAM terminações — nenhuma forma é produzida por regra ou por LLM.
// Cada regra traz um padrão (`re`) de terminação: ela só é exibida se a forma REAL dos dados a cumpre;
// caso contrário o app diz que é exceção. Assim uma explicação nunca contradiz os dados.
import type { Case, Form, Gender, Lemma, Num } from '../../shared/types';
import { normalizeAnswer, stressIndex, stripStress, syllableCount } from '../../shared/russian';
import type { ContentIndex } from './content';

export const CASE_PT: Record<Case, string> = {
  nom: 'nominativo', gen: 'genitivo', dat: 'dativo', acc: 'acusativo', inst: 'instrumental', prep: 'preposicional',
};
export const NUM_PT: Record<Num, string> = { sg: 'singular', pl: 'plural' };
export const GENDER_PT: Record<Gender, string> = { m: 'masculino', f: 'feminino', n: 'neutro' };

export interface GramKey {
  lemma: string;
  c: Case;
  n: Num;
  g?: Gender;
  an?: 'anim' | 'inan';
}

export function keyRef(k: GramKey): string {
  return [k.lemma, k.c, k.n, k.g ?? '-', k.an ?? '-'].join('|');
}

export function parseRef(ref: string): GramKey {
  const [lemma, c, n, g, an] = ref.split('|');
  const k: GramKey = { lemma, c: c as Case, n: n as Num };
  if (g && g !== '-') k.g = g as Gender;
  if (an && an !== '-') k.an = an as 'anim' | 'inan';
  return k;
}

const EXT_STAGE: Partial<Record<Case, number>> = { prep: 0, dat: 1, inst: 2 };

/** Etapas do currículo (menor = antes). Casos estendidos vêm depois: preposicional → dativo → instrumental. */
export function stageOf(l: Lemma, k: GramKey): number {
  const ext = EXT_STAGE[k.c];
  if (ext !== undefined) return (l.pos === 'noun' ? 9 : 12) + ext;
  if (l.pos === 'noun') {
    if (k.c === 'nom') return 1;
    if (k.c === 'acc' && k.n === 'sg') return 2;
    if (k.c === 'gen' && k.n === 'sg') return 3;
    if (k.c === 'gen' && k.n === 'pl') return 4;
    return 5;
  }
  return k.c === 'nom' ? 6 : k.c === 'acc' ? 7 : 8;
}

export type GramFocus = 'all' | 'nom' | 'acc' | 'gen' | 'prep' | 'dat' | 'inst';

const BASE_CASES: Case[] = ['nom', 'acc', 'gen'];
const EXT_CASES: Case[] = ['prep', 'dat', 'inst'];

const keysCache = new WeakMap<ContentIndex, Map<GramFocus, GramKey[]>>();

/** Todas as perguntas possíveis, em ordem de currículo e frequência (memoizado por índice de conteúdo). */
export function gramKeys(ix: ContentIndex, focus: GramFocus = 'all'): GramKey[] {
  let byFocus = keysCache.get(ix);
  if (!byFocus) keysCache.set(ix, (byFocus = new Map()));
  const hit = byFocus.get(focus);
  if (hit) return hit;
  const out: { k: GramKey; stage: number; rank: number }[] = [];
  for (const l of ix.content.lemmas) {
    if (!l.gram) continue;
    const cases = l.gx ? [...BASE_CASES, ...EXT_CASES] : BASE_CASES;
    const push = (k: GramKey) => {
      if (focus !== 'all' && k.c !== focus) return;
      out.push({ k, stage: stageOf(l, k), rank: l.r });
    };
    if (l.pos === 'noun') {
      const nums: Num[] = l.plo ? ['pl'] : l.sgo ? ['sg'] : ['sg', 'pl'];
      for (const n of nums)
        for (const c of cases) {
          if (c === 'nom' && (n === 'sg' || l.plo)) continue; // nominativo singular = forma do dicionário
          push({ lemma: l.id, c, n });
        }
    } else if (l.pos === 'adj') {
      for (const c of cases) {
        for (const g of ['m', 'f', 'n'] as Gender[]) {
          if (c === 'nom' && g === 'm') continue; // = forma do dicionário
          if (c === 'acc' && g === 'm') {
            push({ lemma: l.id, c, n: 'sg', g, an: 'inan' });
            push({ lemma: l.id, c, n: 'sg', g, an: 'anim' });
          } else push({ lemma: l.id, c, n: 'sg', g });
        }
        if (c === 'acc') {
          push({ lemma: l.id, c, n: 'pl', an: 'inan' });
          push({ lemma: l.id, c, n: 'pl', an: 'anim' });
        } else push({ lemma: l.id, c, n: 'pl' });
      }
    }
  }
  const keys = out.sort((a, b) => a.stage - b.stage || a.rank - b.rank).map((x) => x.k);
  byFocus.set(focus, keys);
  return keys;
}

export function findForm(ix: ContentIndex, k: GramKey): Form | undefined {
  const l = ix.lemma.get(k.lemma);
  if (!l) return undefined;
  return ix.formsOf.get(k.lemma)?.find(
    (f) => f.c === k.c && f.n === k.n && (l.pos === 'adj' ? f.g === k.g : true) && (k.an ? f.an === k.an : true),
  );
}

/** Variantes aceitas (a 1ª é a canônica exibida). */
export function answerFor(ix: ContentIndex, k: GramKey): string[] | null {
  return findForm(ix, k)?.v ?? null;
}

export function checkAnswer(input: string, variants: string[]): boolean {
  const n = normalizeAnswer(input);
  if (!n) return false;
  return variants.some((v) => normalizeAnswer(v) === n);
}

export function promptFor(ix: ContentIndex, k: GramKey): { lemma: Lemma; line: string } {
  const lemma = ix.lemma.get(k.lemma)!;
  const parts: string[] = [CASE_PT[k.c]];
  if (lemma.pos === 'adj') {
    parts.push(k.n === 'pl' ? 'plural' : GENDER_PT[k.g!] + ' singular');
    if (k.an) parts.push(k.an === 'anim' ? 'animado' : 'inanimado');
  } else parts.push(NUM_PT[k.n]);
  return { lemma, line: parts.join(' · ') };
}

// ---------- explicações ----------
export type Cls = 'm-hard' | 'm-j' | 'm-soft' | 'm-a' | 'f-a' | 'f-ya' | 'f-iya' | 'f-soft' | 'n-o' | 'n-e' | 'n-ie' | 'n-mya' | 'x';

export function nounClass(l: Lemma): Cls {
  const t = l.t;
  const last = t.slice(-1), last2 = t.slice(-2);
  if (l.g === 'm') return last === 'й' ? 'm-j' : last === 'ь' ? 'm-soft' : last === 'а' || last === 'я' ? 'm-a' : 'm-hard';
  if (l.g === 'f') return last2 === 'ия' ? 'f-iya' : last === 'а' ? 'f-a' : last === 'я' ? 'f-ya' : last === 'ь' ? 'f-soft' : 'x';
  if (l.g === 'n') return last2 === 'мя' ? 'n-mya' : last2 === 'ие' || last2 === 'ье' ? 'n-ie' : last === 'о' ? 'n-o' : last === 'е' ? 'n-e' : 'x';
  return 'x';
}

export const SPELL7 = 'г, к, х, ж, ш, ч, щ';

/** Regra de terminação: `text` é o que o aluno lê; `re` é testado contra a forma dos dados (sem acento, ё≡е). */
export interface EndingRule {
  text: string;
  re?: RegExp;
}
const R = (text: string, re?: RegExp): EndingRule => ({ text, re });
const ZERO = /[^аеиоуыэюя]$/; // sem terminação: a forma acaba em consoante, -ь ou -й

const HARD_PL = {
  'dat.pl': R('Plural de radical duro: dativo -ам, instrumental -ами, preposicional -ах.', /ам$/),
  'inst.pl': R('Plural de radical duro: dativo -ам, instrumental -ами, preposicional -ах.', /ами$/),
  'prep.pl': R('Plural de radical duro: dativo -ам, instrumental -ами, preposicional -ах.', /ах$/),
};
const SOFT_PL = {
  'dat.pl': R('Plural de radical mole: dativo -ям, instrumental -ями, preposicional -ях.', /ям$/),
  'inst.pl': R('Plural de radical mole: dativo -ям, instrumental -ями, preposicional -ях.', /ями$/),
  'prep.pl': R('Plural de radical mole: dativo -ям, instrumental -ями, preposicional -ях.', /ях$/),
};
const MIXED_PL = {
  'dat.pl': R('Plural: dativo -ам (-ям se o radical é mole), instrumental -ами (-ями), preposicional -ах (-ях).', /(ам|ям)$/),
  'inst.pl': R('Plural: dativo -ам (-ям se o radical é mole), instrumental -ами (-ями), preposicional -ах (-ях).', /(ами|ями)$/),
  'prep.pl': R('Plural: dativo -ам (-ям se o radical é mole), instrumental -ами (-ями), preposicional -ах (-ях).', /(ах|ях)$/),
};
const IYA_PL = {
  'dat.pl': R('Em -ие/-ия o plural é -иям, -иями, -иях.', /иям$/),
  'inst.pl': R('Em -ие/-ия o plural é -иям, -иями, -иях.', /иями$/),
  'prep.pl': R('Em -ие/-ия o plural é -иях.', /иях$/),
};

export const NOUN_RULES: Partial<Record<Cls, Record<string, EndingRule>>> = {
  'm-hard': {
    'nom.pl': R(`Masculino terminado em consoante: plural em -ы (-и depois de ${SPELL7}). Alguns têm plural acentuado na terminação: -а́ ou -я́.`, /(ы|и|а|я)$/),
    'gen.sg': R('Masculino terminado em consoante: genitivo singular = +а.', /(а|я)$/),
    'gen.pl': R('Masculino terminado em consoante: genitivo plural = +ов (-ев depois de ц átono; -ей depois de ж, ш, ч, щ).', /(ов|ев|ей)$/),
    'dat.sg': R('Masculino terminado em consoante: dativo singular = +у.', /у$/),
    'inst.sg': R('Masculino terminado em consoante: instrumental singular = +ом (-ем depois de ж, ш, ч, щ, ц átonos).', /(ом|ем)$/),
    'prep.sg': R('Masculino terminado em consoante: preposicional singular = +е. Alguns têm a forma locativa em -у́ depois de в e на.', /(е|у)$/),
    ...HARD_PL,
  },
  'm-j': {
    'nom.pl': R('Masculino em -й: -й → -и.', /и$/), 'gen.sg': R('Masculino em -й: -й → -я.', /я$/), 'gen.pl': R('Masculino em -й: -й → -ев (-ёв sob acento).', /ев$/),
    'dat.sg': R('Masculino em -й: -й → -ю.', /ю$/), 'inst.sg': R('Masculino em -й: -й → -ем (-ём sob acento).', /ем$/), 'prep.sg': R('Masculino em -й: -й → -е.', /е$/),
    ...SOFT_PL,
  },
  'm-soft': {
    'nom.pl': R('Masculino em -ь: -ь → -и.', /и$/), 'gen.sg': R('Masculino em -ь: -ь → -я.', /я$/), 'gen.pl': R('Masculino em -ь: -ь → -ей.', /ей$/),
    'dat.sg': R('Masculino em -ь: -ь → -ю.', /ю$/), 'inst.sg': R('Masculino em -ь: -ь → -ем (-ём sob acento).', /ем$/), 'prep.sg': R('Masculino em -ь: -ь → -е.', /е$/),
    ...SOFT_PL,
  },
  'm-a': {
    'nom.pl': R(`Masculino em -а/-я declina como feminino: -а → -ы (-и depois de ${SPELL7}); -я → -и.`, /(ы|и)$/),
    'gen.sg': R(`Masculino em -а/-я declina como feminino: -а → -ы (-и depois de ${SPELL7}); -я → -и.`, /(ы|и)$/),
    'gen.pl': R('Masculino em -а/-я: genitivo plural sem terminação (zero), como o feminino.', ZERO),
    'dat.sg': R('Masculino em -а/-я declina como feminino: dativo -а/-я → -е.', /е$/),
    'inst.sg': R('Masculino em -а/-я declina como feminino: instrumental -а → -ой; -я → -ей.', /(ой|ей)$/),
    'prep.sg': R('Masculino em -а/-я declina como feminino: preposicional -а/-я → -е.', /е$/),
    ...MIXED_PL,
  },
  'f-a': {
    'nom.pl': R(`Feminino em -а: -а → -ы (-и depois de ${SPELL7}).`, /(ы|и)$/), 'gen.sg': R(`Feminino em -а: -а → -ы (-и depois de ${SPELL7}).`, /(ы|и)$/),
    'gen.pl': R('Feminino em -а: genitivo plural sem terminação (zero): remove o -а; costuma surgir uma vogal fugitiva (о/е) entre consoantes.', ZERO),
    'dat.sg': R('Feminino em -а: dativo -а → -е.', /е$/),
    'inst.sg': R('Feminino em -а: instrumental -а → -ой (-ей depois de ж, ш, ч, щ, ц átonos).', /(ой|ей)$/),
    'prep.sg': R('Feminino em -а: preposicional -а → -е.', /е$/),
    ...HARD_PL,
  },
  'f-ya': {
    'nom.pl': R('Feminino em -я: -я → -и.', /и$/), 'gen.sg': R('Feminino em -я: -я → -и.', /и$/),
    'gen.pl': R('Feminino em -я: genitivo plural em -ь ou -й (depende do radical).', /(ь|й)$/),
    'dat.sg': R('Feminino em -я: dativo -я → -е.', /е$/), 'inst.sg': R('Feminino em -я: instrumental -я → -ей (-ёй sob acento).', /ей$/), 'prep.sg': R('Feminino em -я: preposicional -я → -е.', /е$/),
    ...SOFT_PL,
  },
  'f-iya': {
    'nom.pl': R('Feminino em -ия: -ия → -ии.', /ии$/), 'gen.sg': R('Feminino em -ия: -ия → -ии.', /ии$/), 'gen.pl': R('Feminino em -ия: -ия → -ий.', /ий$/),
    'dat.sg': R('Feminino em -ия: dativo -ия → -ии.', /ии$/), 'inst.sg': R('Feminino em -ия: instrumental -ия → -ией.', /ией$/), 'prep.sg': R('Feminino em -ия: preposicional -ия → -ии.', /ии$/),
    ...IYA_PL,
  },
  'f-soft': {
    'nom.pl': R('Feminino em -ь: -ь → -и.', /и$/), 'gen.sg': R('Feminino em -ь: -ь → -и.', /и$/), 'gen.pl': R('Feminino em -ь: -ь → -ей.', /ей$/),
    'dat.sg': R('Feminino em -ь: dativo -ь → -и.', /и$/), 'inst.sg': R('Feminino em -ь: instrumental -ь → -ью.', /ью$/), 'prep.sg': R('Feminino em -ь: preposicional -ь → -и.', /и$/),
    ...SOFT_PL,
  },
  'n-o': {
    'nom.pl': R('Neutro em -о: -о → -а.', /а$/), 'gen.sg': R('Neutro em -о: -о → -а.', /а$/),
    'gen.pl': R('Neutro em -о: genitivo plural sem terminação (zero); costuma surgir vogal fugitiva (о/е).', ZERO),
    'dat.sg': R('Neutro em -о: dativo -о → -у.', /у$/), 'inst.sg': R('Neutro em -о: instrumental -о → -ом.', /ом$/), 'prep.sg': R('Neutro em -о: preposicional -о → -е.', /е$/),
    ...HARD_PL,
  },
  'n-e': {
    'nom.pl': R('Neutro em -е: -е → -я.', /я$/), 'gen.sg': R('Neutro em -е: -е → -я.', /я$/), 'gen.pl': R('Neutro em -е: genitivo plural em -й ou -ь.', /(й|ь)$/),
    'dat.sg': R('Neutro em -е: dativo -е → -ю.', /ю$/), 'inst.sg': R('Neutro em -е: instrumental -е → -ем (-ём sob acento).', /ем$/), 'prep.sg': R('Neutro em -е: o preposicional singular mantém o -е.', /е$/),
    ...SOFT_PL,
  },
  'n-ie': {
    'nom.pl': R('Neutro em -ие: -ие → -ия.', /ия$/), 'gen.sg': R('Neutro em -ие: -ие → -ия.', /ия$/), 'gen.pl': R('Neutro em -ие: -ие → -ий.', /ий$/),
    'dat.sg': R('Neutro em -ие: dativo -ие → -ию.', /ию$/), 'inst.sg': R('Neutro em -ие: instrumental -ие → -ием.', /ием$/), 'prep.sg': R('Neutro em -ие: preposicional -ие → -ии.', /ии$/),
    ...IYA_PL,
  },
  'n-mya': {
    'nom.pl': R('Neutros em -мя: plural em -ена́.', /ена$/), 'gen.sg': R('Neutros em -мя: -мя → -мени.', /мени$/), 'gen.pl': R('Neutros em -мя: -мя → -мён/-мен.', /мен$/),
    'dat.sg': R('Neutros em -мя: dativo -мя → -мени.', /мени$/), 'inst.sg': R('Neutros em -мя: instrumental -мя → -менем.', /менем$/), 'prep.sg': R('Neutros em -мя: preposicional -мя → -мени.', /мени$/),
    'dat.pl': R('Neutros em -мя: plural -мена́м, -мена́ми, -мена́х.', /менам$/), 'inst.pl': R('Neutros em -мя: plural -мена́м, -мена́ми, -мена́х.', /менами$/), 'prep.pl': R('Neutros em -мя: plural -мена́м, -мена́ми, -мена́х.', /менах$/),
  },
};

const ADJ_SPELL = 'Depois de г, к, х, ж, ш, ч, щ escreve-se и no lugar de ы; depois de sibilantes e de radical mole usam-se as terminações em -е/-и.';
export const ADJ_RULES: Record<string, EndingRule> = {
  'nom.m.sg': R('Masc. sg.: -ый / -ий / -ой (forma do dicionário).'),
  'nom.f.sg': R('Fem. sg. nominativo: -ый → -ая (-ий → -яя).', /(ая|яя)$/),
  'nom.n.sg': R('Neutro sg. nominativo: -ый → -ое (-ий → -ее).', /(ое|ее)$/),
  'nom.pl': R('Plural nominativo: -ый → -ые (-ий/-ой → -ие/-ые).', /(ые|ие)$/),
  'gen.m.sg': R('Genitivo masc./neutro sg.: -ого (-его depois de sibilantes ou radical mole); o г lê-se [в].', /(ого|его)$/),
  'gen.n.sg': R('Genitivo masc./neutro sg.: -ого (-его depois de sibilantes ou radical mole); o г lê-se [в].', /(ого|его)$/),
  'gen.f.sg': R('Genitivo fem. sg.: -ой (-ей).', /(ой|ей)$/),
  'gen.pl': R('Genitivo plural: -ых (-их depois de г, к, х, ж, ш, ч, щ e radical mole).', /(ых|их)$/),
  'acc.f.sg': R('Acusativo feminino: -ая → -ую (-яя → -юю).', /(ую|юю)$/),
  'dat.m.sg': R('Dativo masc./neutro sg.: -ому (-ему depois de sibilantes ou radical mole).', /(ому|ему)$/),
  'dat.n.sg': R('Dativo masc./neutro sg.: -ому (-ему depois de sibilantes ou radical mole).', /(ому|ему)$/),
  'dat.f.sg': R('Dativo fem. sg.: -ой (-ей).', /(ой|ей)$/),
  'dat.pl': R('Dativo plural: -ым (-им depois de г, к, х, ж, ш, ч, щ e radical mole).', /(ым|им)$/),
  'inst.m.sg': R('Instrumental masc./neutro sg.: -ым (-им depois de г, к, х, ж, ш, ч, щ e radical mole).', /(ым|им)$/),
  'inst.n.sg': R('Instrumental masc./neutro sg.: -ым (-им depois de г, к, х, ж, ш, ч, щ e radical mole).', /(ым|им)$/),
  'inst.f.sg': R('Instrumental fem. sg.: -ой (-ей).', /(ой|ей)$/),
  'inst.pl': R('Instrumental plural: -ыми (-ими depois de г, к, х, ж, ш, ч, щ e radical mole).', /(ыми|ими)$/),
  'prep.m.sg': R('Preposicional masc./neutro sg.: -ом (-ем depois de sibilantes ou radical mole).', /(ом|ем)$/),
  'prep.n.sg': R('Preposicional masc./neutro sg.: -ом (-ем depois de sibilantes ou radical mole).', /(ом|ем)$/),
  'prep.f.sg': R('Preposicional fem. sg.: -ой (-ей).', /(ой|ей)$/),
  'prep.pl': R('Preposicional plural: -ых (-их depois de г, к, х, ж, ш, ч, щ e radical mole).', /(ых|их)$/),
};
const ADJ_ACC_STRUCT: Record<string, string> = {
  'm.sg.inan': 'Acusativo masc. inanimado = nominativo.', 'm.sg.anim': 'Acusativo masc. animado = genitivo (-ого/-его).',
  'n.sg': 'Acusativo neutro = nominativo.',
  'pl.inan': 'Acusativo plural inanimado = nominativo plural.', 'pl.anim': 'Acusativo plural animado = genitivo plural (-ых/-их).',
};

/** Forma de comparação com os padrões de terminação: minúscula, sem acento, ё≡е. */
export function ruleForm(s: string): string {
  return stripStress(s).toLowerCase().replace(/ё/g, 'е');
}

/** A regra vale para estas variantes? (sem padrão = regra descritiva, sempre vale.) */
export function ruleHolds(rule: EndingRule, variants: string[]): boolean {
  return !rule.re || variants.some((v) => rule.re!.test(ruleForm(v)));
}

/** Regra de terminação aplicável a uma pergunta (ou undefined). Exportada para os testes regra×dados. */
export function ruleFor(l: Lemma, k: GramKey): EndingRule | undefined {
  if (l.pos === 'noun') return NOUN_RULES[nounClass(l)]?.[`${k.c}.${k.n}`];
  const key = k.n === 'pl' ? `${k.c}.pl` : `${k.c}.${k.g}.sg`;
  return ADJ_RULES[key];
}

export function syllableOfStress(w: string): number {
  const p = stressIndex(w);
  if (p < 0) return -1;
  const plain = [...stripStress(w)];
  let n = 0;
  for (let i = 0; i < p; i++) if ('аеёиоуыэюя'.includes(plain[i].toLowerCase())) n++;
  return n + 1;
}

export function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export const IRREGULAR = 'Declinação irregular ou rara: memorize esta forma.';

/** Linhas de explicação (pt-BR) para o feedback. `input` = resposta do usuário (pode ser vazio). */
export function explain(ix: ContentIndex, k: GramKey, variants: string[], input = ''): string[] {
  const l = ix.lemma.get(k.lemma)!;
  const lines: string[] = [];
  const correct = variants[0];
  if (l.pos === 'noun') {
    const cls = nounClass(l);
    let text: string | undefined;
    if (k.c === 'acc' && k.n === 'pl') text = l.an ? 'Plural animado: acusativo = genitivo plural.' : 'Plural inanimado: acusativo = nominativo plural.';
    else if (k.c === 'acc' && k.n === 'sg' && (cls === 'm-hard' || cls === 'm-j' || cls === 'm-soft'))
      text = l.an ? 'Masculino animado: acusativo singular = genitivo.' : 'Masculino inanimado: acusativo singular = nominativo.';
    else if (k.c === 'acc') text = cls === 'm-a' ? 'Terminação -а → -у; -я → -ю (como o feminino).' : cls.startsWith('n-') ? 'Neutro: acusativo = nominativo.' : cls === 'f-soft' ? 'Feminino em -ь: acusativo = nominativo.' : cls === 'f-iya' ? 'Feminino em -ия: -ия → -ию.' : cls === 'f-ya' ? 'Feminino em -я: -я → -ю.' : cls === 'f-a' ? 'Feminino em -а: -а → -у.' : undefined;
    else {
      const rule = NOUN_RULES[cls]?.[`${k.c}.${k.n}`];
      if (rule && ruleHolds(rule, variants)) text = rule.text; // só mostra a regra se a forma dos dados a cumpre
    }
    lines.push(text ?? IRREGULAR);
  } else {
    const gk = k.n === 'pl' ? 'pl' : `${k.g}.sg`;
    if (k.c === 'acc') {
      const t = k.n === 'pl' ? ADJ_ACC_STRUCT[`pl.${k.an}`] : k.g === 'm' ? ADJ_ACC_STRUCT[`m.sg.${k.an}`] : k.g === 'n' ? ADJ_ACC_STRUCT['n.sg'] : undefined;
      const rule = ADJ_RULES['acc.f.sg'];
      if (t) lines.push(t);
      else if (ruleHolds(rule, variants)) lines.push(rule.text);
      else lines.push(IRREGULAR);
    } else {
      const rule = ADJ_RULES[`${k.c}.${gk}`];
      if (rule && ruleHolds(rule, variants)) lines.push(rule.text);
      else lines.push(IRREGULAR);
    }
    lines.push('O adjetivo concorda com o substantivo em gênero, número e caso.');
    if (k.c !== 'nom' && k.c !== 'acc') lines.push(ADJ_SPELL);
  }
  // mutações detectadas por comparação (não geram forma)
  const base = l.t;
  const target = ruleForm(correct);
  const b = base.toLowerCase().replace(/ё/g, 'е');
  const stem = /[аеёиоуыэюяьй]$/.test(b) ? b.slice(0, -1) : b;
  const p = commonPrefix(b, target);
  if (l.pos === 'noun' && target !== b) {
    if (p < Math.min(2, stem.length)) { lines.length = 0; lines.push('Forma irregular (suplétiva): memorize.'); }
    else if (p < stem.length && !(l.an && k.c === 'acc')) lines.push(`A raiz muda (vogal fugitiva ou alternância): ${l.s} → ${correct}.`);
  }
  const s1 = syllableOfStress(l.s), s2 = syllableOfStress(correct);
  if (syllableCount(correct) > 1 && s1 > 0 && s2 > 0 && s1 !== s2) lines.push(`O acento muda de sílaba (${s1}ª → ${s2}ª): ${correct}.`);
  // dica ortográfica para erro comum ы/и
  if (input) {
    const n = normalizeAnswer(input);
    if (variants.some((v) => normalizeAnswer(v) === n.replace(/ы/g, 'и') || normalizeAnswer(v) === n.replace(/и/g, 'ы')))
      lines.push(`Regra ortográfica: depois de ${SPELL7} nunca se escreve ы — escreve-se и.`);
  }
  if (variants.length > 1) lines.push(`Variantes aceitas: ${variants.join(', ')}.`);
  return lines;
}
