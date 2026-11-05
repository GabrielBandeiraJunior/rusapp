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
    return 5;
  }
  return k.c === 'nom' ? 6 : k.c === 'acc' ? 7 : 8;
}

export type GramFocus = 'all' | 'nom' | 'acc' | 'gen';

/** Todas as perguntas possíveis, em ordem de currículo e frequência. */
export function gramKeys(ix: ContentIndex, focus: GramFocus = 'all'): GramKey[] {
  const out: { k: GramKey; stage: number; rank: number }[] = [];
  for (const l of ix.content.lemmas) {
    if (!l.gram) continue;
    const push = (k: GramKey) => {
      if (focus !== 'all' && k.c !== focus) return;
      out.push({ k, stage: stageOf(l, k), rank: l.r });
    };
    if (l.pos === 'noun') {
      const nums: Num[] = l.plo ? ['pl'] : l.sgo ? ['sg'] : ['sg', 'pl'];
      for (const n of nums)
        for (const c of ['nom', 'acc', 'gen'] as Case[]) {
          if (c === 'nom' && (n === 'sg' || l.plo)) continue; // nominativo singular = forma do dicionário
          if (c === 'nom' && l.sgo) continue;
          push({ lemma: l.id, c, n });
        }
    } else if (l.pos === 'adj') {
      for (const c of ['nom', 'acc', 'gen'] as Case[]) {
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
    'nom.pl': `Masculino terminado em consoante: plural em -ы (-и depois de ${SPELL7}). Alguns têm plural em -а́/-я́ (дом → дома́).`,
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
    'nom.pl': 'Neutros em -мя (имя, время): plural em -ена́ (имена́).', 'gen.sg': 'Neutros em -мя: -мя → -мени.',
    'gen.pl': 'Neutros em -мя: -мя → -мён/-мен.', 'acc.sg': 'Neutro: acusativo = nominativo.',
  },
};

const ADJ_NOM: Record<string, string> = {
  'm.sg': 'Masc. sg.: -ый / -ий / -ой (forma do dicionário).', 'f.sg': 'Fem. sg. nominativo: -ый → -ая (-ий → -яя).',
  'n.sg': 'Neutro sg. nominativo: -ый → -ое (-ий → -ее).', 'pl': 'Plural nominativo: -ый → -ые (-ий/-ой → -ие/-ые).',
};
const ADJ_GEN: Record<string, string> = {
  'm.sg': 'Genitivo masc./neutro sg.: -ого (-его depois de шипящие/мягкий); o г lê-se [в].',
  'n.sg': 'Genitivo masc./neutro sg.: -ого (-его depois de шипящие/мягкий); o г lê-se [в].',
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
    lines.push(rule ?? 'Declinação irregular ou rara: memorize esta forma.');
  } else {
    const gk = k.n === 'pl' ? 'pl' : `${k.g}.sg`;
    if (k.c === 'nom') lines.push(ADJ_NOM[gk]);
    else if (k.c === 'gen') lines.push(ADJ_GEN[gk]);
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
    if (p < Math.min(2, stem.length)) lines.push('Forma irregular (suplétiva): memorize.');
    else if (p < stem.length && !(l.an && k.c === 'acc')) lines.push(`A raiz muda (vogal fugitiva ou alternância): ${stripStress(base)} → ${stripStress(correct)}.`);
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
