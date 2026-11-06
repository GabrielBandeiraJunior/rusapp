// Gramática gerativa: o usuário DIGITA a forma; validação contra a tabela `form` (dados do OpenRussian).
// As regras aqui só EXPLICAM terminações — nenhuma forma é produzida por regra ou por LLM.
import type { Case, Form, Gender, Lemma, Num } from '../../shared/types';
import { ACUTE, normalizeAnswer, stressIndex, stripStress, syllableCount } from '../../shared/russian';
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

/** Etapas do currículo (menor = antes). */
export function stageOf(l: Lemma, k: GramKey): number {
  if (l.pos === 'noun') {
    if (k.c === 'nom') return 1;
    if (k.c === 'acc' && k.n === 'sg') return 2;
    if (k.c === 'gen' && k.n === 'sg') return 3;
    if (k.c === 'gen' && k.n === 'pl') return 4;
    if (k.c === 'prep') return 9;
    if (k.c === 'dat') return 10;
    if (k.c === 'inst') return 11;
    return 5;
  }
  const adjStage = { nom: 6, acc: 7, gen: 8, dat: 12, inst: 13, prep: 14 } as const;
  return adjStage[k.c as keyof typeof adjStage] ?? 8;
}

export type GramFocus = 'all' | 'nom' | 'acc' | 'gen' | 'dat' | 'inst' | 'prep';

const CASES: Case[] = ['nom', 'acc', 'gen', 'dat', 'inst', 'prep'];

/** Todas as perguntas possíveis, em ordem de currículo e frequência. */
export function gramKeys(ix: ContentIndex, focus: GramFocus = 'all'): GramKey[] {
  const out: { k: GramKey; stage: number; rank: number }[] = [];
  for (const l of ix.content.lemmas) {
    if (!l.gram) continue;
    const push = (k: GramKey) => {
      if (focus !== 'all' && k.c !== focus) return;
      if (!findForm(ix, k)) return; // nada de forma inventada: só perguntas com forma nos dados
      out.push({ k, stage: stageOf(l, k), rank: l.r });
    };
    if (l.pos === 'noun') {
      const nums: Num[] = l.plo ? ['pl'] : l.sgo ? ['sg'] : ['sg', 'pl'];
      for (const n of nums)
        for (const c of CASES) {
          if (c === 'nom' && (n === 'sg' || l.plo)) continue; // nominativo singular = forma do dicionário
          if (c === 'nom' && l.sgo) continue;
          push({ lemma: l.id, c, n });
        }
    } else if (l.pos === 'adj') {
      for (const c of CASES) {
        for (const g of ['m', 'f', 'n'] as Gender[]) {
          if (c === 'nom' && g === 'm') continue; // acusativo neutro: sem distinção de animacidade (forma(s) do dicionário)
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
  return out.sort((a, b) => a.stage - b.stage || a.rank - b.rank).map((x) => x.k);
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
type Cls = 'm-hard' | 'm-j' | 'm-soft' | 'm-a' | 'f-a' | 'f-ya' | 'f-iya' | 'f-soft' | 'n-o' | 'n-e' | 'n-ie' | 'n-mya' | 'x';

export function nounClass(l: Lemma): Cls {
  const t = l.t;
  const last = t.slice(-1), last2 = t.slice(-2);
  if (l.g === 'm') return last === 'й' ? 'm-j' : last === 'ь' ? 'm-soft' : last === 'а' || last === 'я' ? 'm-a' : 'm-hard';
  if (l.g === 'f') return last2 === 'ия' ? 'f-iya' : last === 'а' ? 'f-a' : last === 'я' ? 'f-ya' : last === 'ь' ? 'f-soft' : 'x';
  if (l.g === 'n') return last2 === 'мя' ? 'n-mya' : last2 === 'ие' || last2 === 'ье' ? 'n-ie' : last === 'о' ? 'n-o' : last === 'е' ? 'n-e' : 'x';
  return 'x';
}

const SPELL7 = 'г, к, х, ж, ш, ч, щ';

const NOUN_RULES: Partial<Record<Cls, Record<string, string>>> = {
  'm-hard': {
    'nom.pl': `Masculino terminado em consoante: plural em -ы (-и depois de ${SPELL7}). Alguns têm plural acentuado na terminação: -а́ ou -я́ (дом → дома́).`,
    'gen.sg': 'Masculino terminado em consoante: genitivo singular = + а.',
    'gen.pl': 'Masculino terminado em consoante: genitivo plural = + ов (ev/ёв após ц e quando átono; + ей após ж, ш, ч, щ).',
    'acc.sg': 'Masculino: inanimado → acusativo = nominativo; animado → acusativo = genitivo (+ а).',
  },
  'm-j': {
    'nom.pl': 'Masculino em -й: -й → -и.', 'gen.sg': 'Masculino em -й: -й → -я.', 'gen.pl': 'Masculino em -й: -й → -ев (-ёв sob acento).',
    'acc.sg': 'Masculino: inanimado → acusativo = nominativo; animado → acusativo = genitivo (-й → -я).',
  },
  'm-soft': {
    'nom.pl': 'Masculino em -ь: -ь → -и.', 'gen.sg': 'Masculino em -ь: -ь → -я.', 'gen.pl': 'Masculino em -ь: -ь → -ей.',
    'acc.sg': 'Masculino: inanimado → acusativo = nominativo; animado → acusativo = genitivo (-ь → -я).',
  },
  'm-a': {
    'nom.pl': `Masculino em -а/-я declina como feminino: -а → -ы (-и depois de ${SPELL7}); -я → -и.`,
    'gen.sg': `Masculino em -а/-я declina como feminino: -а → -ы (-и depois de ${SPELL7}); -я → -и.`,
    'gen.pl': 'Masculino em -а/-я: genitivo plural sem terminação (zero), como o feminino.',
    'acc.sg': 'Terminação -а → -у; -я → -ю (como o feminino).',
  },
  'f-a': {
    'nom.pl': `Feminino em -а: -а → -ы (-и depois de ${SPELL7}).`, 'gen.sg': `Feminino em -а: -а → -ы (-и depois de ${SPELL7}).`,
    'gen.pl': 'Feminino em -а: genitivo plural sem terminação (zero): remove o -а; costuma surgir uma vogal fugitiva (о/е) entre consoantes.',
    'acc.sg': 'Feminino em -а: -а → -у.',
  },
  'f-ya': {
    'nom.pl': 'Feminino em -я: -я → -и.', 'gen.sg': 'Feminino em -я: -я → -и.',
    'gen.pl': 'Feminino em -я: genitivo plural em -ь, -й ou -ей (depende do radical).', 'acc.sg': 'Feminino em -я: -я → -ю.',
  },
  'f-iya': {
    'nom.pl': 'Feminino em -ия: -ия → -ии.', 'gen.sg': 'Feminino em -ия: -ия → -ии.', 'gen.pl': 'Feminino em -ия: -ия → -ий.', 'acc.sg': 'Feminino em -ия: -ия → -ию.',
  },
  'f-soft': {
    'nom.pl': 'Feminino em -ь: -ь → -и.', 'gen.sg': 'Feminino em -ь: -ь → -и.', 'gen.pl': 'Feminino em -ь: -ь → -ей.',
    'acc.sg': 'Feminino em -ь: acusativo = nominativo.',
  },
  'n-o': {
    'nom.pl': 'Neutro em -о: -о → -а.', 'gen.sg': 'Neutro em -о: -о → -а.',
    'gen.pl': 'Neutro em -о: genitivo plural sem terminação (zero); costuma surgir vogal fugitiva (о/е).', 'acc.sg': 'Neutro: acusativo = nominativo.',
  },
  'n-e': {
    'nom.pl': 'Neutro em -е: -е → -я.', 'gen.sg': 'Neutro em -е: -е → -я.', 'gen.pl': 'Neutro em -е: genitivo plural em -й, -ь ou -ей.', 'acc.sg': 'Neutro: acusativo = nominativo.',
  },
  'n-ie': {
    'nom.pl': 'Neutro em -ие: -ие → -ия.', 'gen.sg': 'Neutro em -ие: -ие → -ия.', 'gen.pl': 'Neutro em -ие: -ие → -ий.', 'acc.sg': 'Neutro: acusativo = nominativo.',
  },
  'n-mya': {
    'nom.pl': 'Neutros em -мя: plural em -ена́.', 'gen.sg': 'Neutros em -мя: -мя → -мени.',
    'gen.pl': 'Neutros em -мя: -мя → -мён/-мен.', 'acc.sg': 'Neutro: acusativo = nominativo.',
  },
};

const ADJ_NOM: Record<string, string> = {
  'm.sg': 'Masc. sg.: -ый / -ий / -ой (forma do dicionário).', 'f.sg': 'Fem. sg. nominativo: -ый → -ая (-ий → -яя).',
  'n.sg': 'Neutro sg. nominativo: -ый → -ое (-ий → -ее).', 'pl': 'Plural nominativo: -ый → -ые (-ий/-ой → -ие/-ые).',
};
const ADJ_GEN: Record<string, string> = {
  'm.sg': 'Genitivo masc./neutro sg.: -ого (-его depois de sibilantes ou radical mole); o г lê-se [в].',
  'n.sg': 'Genitivo masc./neutro sg.: -ого (-его depois de sibilantes ou radical mole); o г lê-se [в].',
  'f.sg': 'Genitivo fem. sg.: -ой (-ей).', 'pl': 'Genitivo plural: -ых (-их depois de г, к, х, ж, ш, ч, щ e radical mole).',
};
const ADJ_ACC: Record<string, string> = {
  'm.sg.inan': 'Acusativo masc. inanimado = nominativo.', 'm.sg.anim': 'Acusativo masc. animado = genitivo (-ого/-его).',
  'f.sg': 'Acusativo feminino: -ая → -ую (-яя → -юю).', 'n.sg': 'Acusativo neutro = nominativo.',
  'pl.inan': 'Acusativo plural inanimado = nominativo plural.', 'pl.anim': 'Acusativo plural animado = genitivo plural (-ых/-их).',
};

function syllableOfStress(w: string): number {
  const p = stressIndex(w);
  if (p < 0) return -1;
  const plain = [...stripStress(w)];
  let n = 0;
  for (let i = 0; i < p; i++) if ('аеёиоуыэюя'.includes(plain[i].toLowerCase())) n++;
  return n + 1;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// ---------- dativo / instrumental / preposicional ----------
const norm = (w: string) => stripStress(w).toLowerCase().replace(/ё/g, 'е');
const SIBIL = 'ж, ш, ч, щ, ц';

interface EndRule { text: string; ends: () => string[] }
const drop = (t: string, n: number) => t.slice(0, t.length - n);

/** Terminação regular (singular) por classe: texto da regra e formas previstas (sem acento, ё→е). */
function nounSgRule(l: Lemma, cls: Cls, c: Case): EndRule | null {
  const t = norm(l.t);
  const soft = (e: string) => drop(t, 1) + e;
  const a1 = (e: string) => drop(t, 1) + e;
  const table: Partial<Record<Case, Partial<Record<Cls, EndRule>>>> = {
    dat: {
      'm-hard': { text: 'Dativo singular, masculino em consoante: + у.', ends: () => [t + 'у'] },
      'm-j': { text: 'Dativo singular, masculino em -й: -й → -ю.', ends: () => [soft('ю')] },
      'm-soft': { text: 'Dativo singular, masculino em -ь: -ь → -ю.', ends: () => [soft('ю')] },
      'm-a': { text: 'Dativo singular, masculino em -а/-я: -а → -е, -я → -е.', ends: () => [a1('е')] },
      'f-a': { text: 'Dativo singular, feminino em -а: -а → -е.', ends: () => [a1('е')] },
      'f-ya': { text: 'Dativo singular, feminino em -я: -я → -е.', ends: () => [a1('е')] },
      'f-iya': { text: 'Dativo singular, feminino em -ия: -ия → -ии.', ends: () => [a1('и')] },
      'f-soft': { text: 'Dativo singular, feminino em -ь: -ь → -и.', ends: () => [soft('и')] },
      'n-o': { text: 'Dativo singular, neutro em -о: -о → -у.', ends: () => [a1('у')] },
      'n-e': { text: 'Dativo singular, neutro em -е: -е → -ю (-у depois de ц, ж, ш, ч, щ: се́рдце → се́рдцу).', ends: () => [a1('ю'), a1('у')] },
      'n-ie': { text: 'Dativo singular, neutro em -ие: -ие → -ию.', ends: () => [a1('ю')] },
      'n-mya': { text: 'Neutros em -мя: -мя → -мени.', ends: () => [drop(t, 2) + 'мени'] },
    },
    inst: {
      'm-hard': { text: `Instrumental singular, masculino em consoante: + ом (+ ем depois de ${SIBIL} sem acento).`, ends: () => [t + 'ом', t + 'ем'] },
      'm-j': { text: 'Instrumental singular, masculino em -й: -й → -ем (-ём sob acento).', ends: () => [soft('ем')] },
      'm-soft': { text: 'Instrumental singular, masculino em -ь: -ь → -ем (-ём sob acento).', ends: () => [soft('ем')] },
      'm-a': { text: 'Instrumental singular, masculino em -а/-я: -а → -ой, -я → -ей (como o feminino).', ends: () => [a1('ой'), a1('ей'), a1('ою'), a1('ею')] },
      'f-a': { text: `Instrumental singular, feminino em -а: -а → -ой (-ей depois de ${SIBIL} sem acento).`, ends: () => [a1('ой'), a1('ей'), a1('ою'), a1('ею')] },
      'f-ya': { text: 'Instrumental singular, feminino em -я: -я → -ей (-ёй sob acento).', ends: () => [a1('ей'), a1('ею')] },
      'f-iya': { text: 'Instrumental singular, feminino em -ия: -ия → -ией.', ends: () => [a1('ей'), a1('ею')] },
      'f-soft': { text: 'Instrumental singular, feminino em -ь: -ь → -ью.', ends: () => [soft('ью')] },
      'n-o': { text: 'Instrumental singular, neutro em -о: -о → -ом.', ends: () => [a1('ом')] },
      'n-e': { text: 'Instrumental singular, neutro em -е: -е → -ем.', ends: () => [a1('ем')] },
      'n-ie': { text: 'Instrumental singular, neutro em -ие: -ие → -ием.', ends: () => [a1('ем')] },
      'n-mya': { text: 'Neutros em -мя: -мя → -менем.', ends: () => [drop(t, 2) + 'менем'] },
    },
    prep: {
      'm-hard': { text: 'Preposicional singular, masculino em consoante: + е. (Alguns têm -у́ após в/на para lugar: в лесу́, в аэропорту́.)', ends: () => [t + 'е', t + 'у'] },
      'm-j': { text: 'Preposicional singular, masculino em -й: -й → -е.', ends: () => [soft('е')] },
      'm-soft': { text: 'Preposicional singular, masculino em -ь: -ь → -е.', ends: () => [soft('е')] },
      'm-a': { text: 'Preposicional singular, masculino em -а/-я: -а → -е, -я → -е.', ends: () => [a1('е')] },
      'f-a': { text: 'Preposicional singular, feminino em -а: -а → -е.', ends: () => [a1('е')] },
      'f-ya': { text: 'Preposicional singular, feminino em -я: -я → -е.', ends: () => [a1('е')] },
      'f-iya': { text: 'Preposicional singular, feminino em -ия: -ия → -ии.', ends: () => [a1('и')] },
      'f-soft': { text: 'Preposicional singular, feminino em -ь: -ь → -и.', ends: () => [soft('и')] },
      'n-o': { text: 'Preposicional singular, neutro em -о: -о → -е.', ends: () => [a1('е')] },
      'n-e': { text: 'Preposicional singular, neutro em -е: não muda.', ends: () => [t] },
      'n-ie': { text: 'Preposicional singular, neutro em -ие: -ие → -ии.', ends: () => [a1('и')] },
      'n-mya': { text: 'Neutros em -мя: -мя → -мени.', ends: () => [drop(t, 2) + 'мени'] },
    },
  };
  return table[c]?.[cls] ?? null;
}

const PL_END: Partial<Record<Case, { text: string; re: RegExp }>> = {
  dat: { text: 'Dativo plural: -ам (-ям nos substantivos de radical mole). Vale para os três gêneros.', re: /(ам|ям)$/ },
  inst: { text: 'Instrumental plural: -ами (-ями nos de radical mole). Vale para os três gêneros.', re: /(ами|ями)$/ },
  prep: { text: 'Preposicional plural: -ах (-ях nos de radical mole). Vale para os três gêneros.', re: /(ах|ях)$/ },
};

const EXCEPTION = 'Esta forma foge da regra regular: memorize-a.';

function newCaseNounRule(l: Lemma, k: GramKey, actual: string[]): string {
  if (k.n === 'pl') {
    const e = PL_END[k.c];
    return e && actual.some((v) => e.re.test(norm(v))) ? e.text : EXCEPTION;
  }
  const rule = nounSgRule(l, nounClass(l), k.c);
  if (!rule) return EXCEPTION;
  const predicted = rule.ends();
  return actual.some((v) => predicted.includes(norm(v))) ? rule.text : `${rule.text} Aqui há uma exceção: memorize ${actual[0]}.`;
}

const ADJ_NEW: Record<string, { text: string; re: RegExp }> = {
  'dat.m.sg': { text: 'Dativo masc./neutro sg.: -ому (-ему depois de sibilantes ou radical mole).', re: /(ому|ему)$/ },
  'dat.n.sg': { text: 'Dativo masc./neutro sg.: -ому (-ему depois de sibilantes ou radical mole).', re: /(ому|ему)$/ },
  'dat.f.sg': { text: 'Dativo fem. sg.: -ой (-ей).', re: /(ой|ей)$/ },
  'dat.pl': { text: 'Dativo plural: -ым (-им depois de г, к, х, ж, ш, ч, щ e radical mole).', re: /(ым|им)$/ },
  'inst.m.sg': { text: 'Instrumental masc./neutro sg.: -ым (-им depois de sibilantes ou radical mole).', re: /(ым|им)$/ },
  'inst.n.sg': { text: 'Instrumental masc./neutro sg.: -ым (-им depois de sibilantes ou radical mole).', re: /(ым|им)$/ },
  'inst.f.sg': { text: 'Instrumental fem. sg.: -ой (-ей); também existe -ою (-ею) na escrita formal.', re: /(ой|ей|ою|ею)$/ },
  'inst.pl': { text: 'Instrumental plural: -ыми (-ими depois de г, к, х, ж, ш, ч, щ e radical mole).', re: /(ыми|ими)$/ },
  'prep.m.sg': { text: 'Preposicional masc./neutro sg.: -ом (-ем depois de sibilantes ou radical mole).', re: /(ом|ем)$/ },
  'prep.n.sg': { text: 'Preposicional masc./neutro sg.: -ом (-ем depois de sibilantes ou radical mole).', re: /(ом|ем)$/ },
  'prep.f.sg': { text: 'Preposicional fem. sg.: -ой (-ей).', re: /(ой|ей)$/ },
  'prep.pl': { text: 'Preposicional plural: -ых (-их depois de г, к, х, ж, ш, ч, щ e radical mole).', re: /(ых|их)$/ },
};

function newCaseAdjRule(k: GramKey, actual: string[]): string {
  const e = ADJ_NEW[k.n === 'pl' ? `${k.c}.pl` : `${k.c}.${k.g}.sg`];
  return e && actual.some((v) => e.re.test(norm(v))) ? e.text : EXCEPTION;
}

/** Linhas de explicação (pt-BR) para o feedback. `input` = resposta do usuário (pode ser vazio). */
export function explain(ix: ContentIndex, k: GramKey, variants: string[], input = ''): string[] {
  const l = ix.lemma.get(k.lemma)!;
  const lines: string[] = [];
  const correct = variants[0];
  if (l.pos === 'noun') {
    const cls = nounClass(l);
    const key = `${k.c}.${k.n}`;
    let rule = NOUN_RULES[cls]?.[key];
    if (k.c === 'acc' && k.n === 'pl') rule = l.an ? 'Plural animado: acusativo = genitivo plural.' : 'Plural inanimado: acusativo = nominativo plural.';
    if (k.c === 'acc' && k.n === 'sg' && (cls === 'm-hard' || cls === 'm-j' || cls === 'm-soft'))
      rule = l.an ? 'Masculino animado: acusativo singular = genitivo.' : 'Masculino inanimado: acusativo singular = nominativo.';
    if (k.c === 'dat' || k.c === 'inst' || k.c === 'prep') rule = newCaseNounRule(l, k, variants);
    lines.push(rule ?? 'Declinação irregular ou rara: memorize esta forma.');
  } else {
    const gk = k.n === 'pl' ? 'pl' : `${k.g}.sg`;
    if (k.c === 'nom') lines.push(ADJ_NOM[gk]);
    else if (k.c === 'gen') lines.push(ADJ_GEN[gk]);
    else if (k.c === 'dat' || k.c === 'inst' || k.c === 'prep') lines.push(newCaseAdjRule(k, variants));
    else lines.push(ADJ_ACC[k.n === 'pl' ? `pl.${k.an}` : k.g === 'm' ? `m.sg.${k.an}` : gk] ?? '');
    lines.push('O adjetivo concorda com o substantivo em gênero, número e caso.');
  }
  // mutações detectadas por comparação (não geram forma)
  const base = l.t;
  const target = stripStress(correct).toLowerCase().replace(/ё/g, 'е');
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

export { ACUTE };
