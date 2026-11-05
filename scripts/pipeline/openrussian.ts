// Parser do OpenRussian (TSV com extensão .csv) → estruturas normalizadas, com acento em U+0301.
import { readFileSync } from 'node:fs';
import { fromApostrophe, stripStress, normalizeAnswer, wordHasRequiredStress, syllableCount } from '../../shared/russian.ts';

/** Monossílabos ficam sem marca (exceção da regra de acento); demais mantêm U+0301. */
export function canon(f: string): string {
  return syllableCount(f) <= 1 ? stripStress(f) : f;
}

export type Pos = 'noun' | 'adj' | 'verb' | 'other';

export interface RawForm {
  /** formas aceitas (a primeira é a canônica), já com U+0301 */
  variants: string[];
  case?: string;
  number?: 'sg' | 'pl';
  gender?: 'm' | 'f' | 'n';
  tense?: string;
  person?: string;
  aspect?: string;
  animacy?: 'anim' | 'inan';
  /** nome da coluna de origem (rastreabilidade) */
  col: string;
}

export interface RawLemma {
  key: string; // pos:bare
  line: number; // índice da linha (0 = cabeçalho) no arquivo de origem
  pos: Pos;
  bare: string;
  stress: string;
  en: string;
  gender?: 'm' | 'f' | 'n';
  animate?: boolean;
  indeclinable?: boolean;
  sgOnly?: boolean;
  plOnly?: boolean;
  aspect?: string;
  forms: RawForm[];
  /** todas as formas (texto sem marca normalizado) → acentuadas, para indexar frases */
  index: Map<string, Set<string>>;
  broken: string[]; // problemas de dados detectados
}

export function readTsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf8').replace(/\r/g, '');
  const all = text.split('\n');
  const head = all[0].split('\t');
  const rows: Record<string, string>[] = [];
  for (let n = 1; n < all.length; n++) {
    if (!all[n]) continue;
    const cells = all[n].split('\t');
    const o: Record<string, string> = { __line: String(n) };
    head.forEach((h, i) => (o[h] = (cells[i] ?? '').trim()));
    rows.push(o);
  }
  return rows;
}

/** Divide uma célula com variantes ("то'т, того'") em formas acentuadas. Retorna null se houver lixo. */
export function parseCell(cell: string): string[] | null {
  if (!cell) return null;
  const parts = cell.split(/\s*[,;]\s*/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/[*/()\[\]?!0-9]/.test(p)) return null;
    const f0 = fromApostrophe(p);
    if (!f0 || !/^[Ѐ-ӿ́-]+$/.test(f0)) return null;
    out.push(canon(f0));
  }
  return out.length ? out : null;
}

const CASES = ['nom', 'gen', 'dat', 'acc', 'inst', 'prep'] as const;

function addIndex(l: RawLemma, form: string) {
  const k = normalizeAnswer(form);
  if (!l.index.has(k)) l.index.set(k, new Set());
  l.index.get(k)!.add(form);
}

function base(row: Record<string, string>, pos: Pos): RawLemma | null {
  const bare = row.bare;
  if (!bare || /[\s*/]/.test(bare)) return null;
  const stress0 = fromApostrophe(row.accented || bare);
  const stress = stress0 ? canon(stress0) : stress0;
  if (!stress || stripStress(stress) !== bare.normalize('NFC')) {
    // diferenças de ё/е: tolerar se normalização coincidir
    if (!stress || normalizeAnswer(stress) !== normalizeAnswer(bare)) return null;
  }
  return {
    key: `${pos}:${bare}`, line: Number(row.__line), pos, bare: bare.normalize('NFC'), stress, en: row.translations_en ?? '',
    forms: [], index: new Map(), broken: [],
  };
}

export function loadNouns(path: string): RawLemma[] {
  const res: RawLemma[] = [];
  for (const row of readTsv(path)) {
    const l = base(row, 'noun');
    if (!l) continue;
    l.gender = (['m', 'f', 'n'].includes(row.gender) ? row.gender : undefined) as RawLemma['gender'];
    l.animate = row.animate === '1';
    l.indeclinable = row.indeclinable === '1';
    l.sgOnly = row.sg_only === '1';
    l.plOnly = row.pl_only === '1';
    for (const num of ['sg', 'pl'] as const) {
      for (const c of CASES) {
        const col = `${num}_${c}`;
        if (!row[col]) continue;
        const v = parseCell(row[col]);
        if (!v) { l.broken.push(col); continue; }
        l.forms.push({ variants: v, case: c, number: num, gender: l.gender, animacy: l.animate ? 'anim' : 'inan', col });
        v.forEach((f) => addIndex(l, f));
      }
    }
    addIndex(l, l.stress);
    res.push(l);
  }
  return res;
}

export function loadAdjectives(path: string): RawLemma[] {
  const res: RawLemma[] = [];
  for (const row of readTsv(path)) {
    const l = base(row, 'adj');
    if (!l) continue;
    for (const g of ['m', 'f', 'n', 'pl'] as const) {
      for (const c of CASES) {
        const col = `decl_${g}_${c}`;
        if (!row[col]) continue;
        const v = parseCell(row[col]);
        if (!v) { l.broken.push(col); continue; }
        l.forms.push({ variants: v, case: c, number: g === 'pl' ? 'pl' : 'sg', gender: g === 'pl' ? undefined : g, col });
        v.forEach((f) => addIndex(l, f));
      }
    }
    for (const [col, g] of [['short_m', 'm'], ['short_f', 'f'], ['short_n', 'n'], ['short_pl', undefined]] as const) {
      const v = row[col] ? parseCell(row[col]) : null;
      if (v) v.forEach((f) => addIndex(l, f));
      void g;
    }
    addIndex(l, l.stress);
    res.push(l);
  }
  return res;
}

export function loadVerbs(path: string): RawLemma[] {
  const res: RawLemma[] = [];
  for (const row of readTsv(path)) {
    const l = base(row, 'verb');
    if (!l) continue;
    l.aspect = row.aspect;
    const spec: [string, string, string | undefined, string | undefined, 'sg' | 'pl' | undefined, 'm' | 'f' | 'n' | undefined][] = [
      ['past_m', 'past', undefined, undefined, 'sg', 'm'], ['past_f', 'past', undefined, undefined, 'sg', 'f'],
      ['past_n', 'past', undefined, undefined, 'sg', 'n'], ['past_pl', 'past', undefined, undefined, 'pl', undefined],
      ['presfut_sg1', 'presfut', '1', undefined, 'sg', undefined], ['presfut_sg2', 'presfut', '2', undefined, 'sg', undefined],
      ['presfut_sg3', 'presfut', '3', undefined, 'sg', undefined], ['presfut_pl1', 'presfut', '1', undefined, 'pl', undefined],
      ['presfut_pl2', 'presfut', '2', undefined, 'pl', undefined], ['presfut_pl3', 'presfut', '3', undefined, 'pl', undefined],
      ['imperative_sg', 'imp', undefined, undefined, 'sg', undefined], ['imperative_pl', 'imp', undefined, undefined, 'pl', undefined],
    ];
    for (const [col, tense, person, , number, gender] of spec) {
      if (!row[col]) continue;
      const v = parseCell(row[col]);
      if (!v) { l.broken.push(col); continue; }
      l.forms.push({ variants: v, tense, person, number, gender, aspect: l.aspect, col });
      v.forEach((f) => addIndex(l, f));
    }
    addIndex(l, l.stress);
    res.push(l);
  }
  return res;
}

export function loadOthers(path: string): RawLemma[] {
  const res: RawLemma[] = [];
  for (const row of readTsv(path)) {
    const l = base(row, 'other');
    if (!l) continue;
    addIndex(l, l.stress);
    res.push(l);
  }
  return res;
}

/** Todas as formas exibidas de um lema têm acento obrigatório? */
export function stressComplete(l: RawLemma): boolean {
  if (!wordHasRequiredStress(l.stress)) return false;
  return l.forms.every((f) => f.variants.every(wordHasRequiredStress));
}
