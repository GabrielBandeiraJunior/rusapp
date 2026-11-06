// Exercícios extras com resposta SEMPRE vinda dos dados: frases com lacuna, conjugação e pares de aspecto.
import { normalizeAnswer, stripStress } from '../../shared/russian';
import type { Case, Form, Num } from '../../shared/types';
import type { ContentIndex } from './content';
import { CASE_PT, NUM_PT } from './grammar';

const norm = (w: string) => stripStress(w).toLowerCase().replace(/ё/g, 'е');

// ---------- frases com lacuna ----------
export interface ClozeRef { sid: string; i: number }

export const clozeRef = (c: ClozeRef) => `${c.sid}#${c.i}`;
export function parseClozeRef(ref: string): ClozeRef {
  const k = ref.lastIndexOf('#');
  return { sid: ref.slice(0, k), i: Number(ref.slice(k + 1)) };
}

/** Rótulos "caso + número" possíveis para a palavra (várias formas podem coincidir: ex. gen. sg. = nom. pl.). */
export function formLabels(ix: ContentIndex, lemmaId: string, word: string): string[] {
  const out: string[] = [];
  for (const f of ix.formsOf.get(lemmaId) ?? []) {
    if (!f.c || !f.n) continue;
    if (!f.v.some((v) => norm(v) === norm(word))) continue;
    const label = `${CASE_PT[f.c as Case]} ${NUM_PT[f.n as Num]}`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/** Posições de palavras declinadas (substantivo/adjetivo fora da forma de dicionário) com forma confirmada nos dados. */
export function clozeList(ix: ContentIndex): ClozeRef[] {
  const out: ClozeRef[] = [];
  for (const s of ix.content.sentences) {
    s.tk.forEach(([text, lid], i) => {
      if (!lid) return;
      const l = ix.lemma.get(lid);
      if (!l || (l.pos !== 'noun' && l.pos !== 'adj')) return;
      if (norm(text) === norm(l.t)) return; // forma de dicionário: sem graça
      if (formLabels(ix, lid, text).length === 0) return;
      out.push({ sid: s.id, i });
    });
  }
  return out;
}

export function checkCloze(input: string, token: string): boolean {
  const n = normalizeAnswer(input);
  return !!n && n === normalizeAnswer(token);
}

// ---------- conjugação ----------
export const PERSON_PT: Record<string, string> = {
  sg1: '1ª pessoa do singular (eu)', sg2: '2ª pessoa do singular (tu/você)', sg3: '3ª pessoa do singular (ele/ela)',
  pl1: '1ª pessoa do plural (nós)', pl2: '2ª pessoa do plural (vocês)', pl3: '3ª pessoa do plural (eles/elas)',
};
const PAST_PT: Record<string, string> = { m: 'masculino singular', f: 'feminino singular', n: 'neutro singular', pl: 'plural' };

export function conjLabel(f: Form, asp?: 'impf' | 'pf'): string {
  const col = f.id.split('|')[1];
  if (f.tn === 'past') return `passado · ${PAST_PT[col.replace('past_', '')] ?? col}`;
  const tense = asp === 'pf' ? 'futuro' : 'presente';
  return `${tense} · ${PERSON_PT[col.replace('presfut_', '')] ?? col}`;
}

/** Colunas pedidas, em ordem didática. */
export const CONJ_COLS = ['presfut_sg1', 'presfut_sg2', 'presfut_sg3', 'presfut_pl1', 'presfut_pl2', 'presfut_pl3', 'past_m', 'past_f', 'past_n', 'past_pl'];

export function conjForm(ix: ContentIndex, ref: string): Form | undefined {
  const [lemma] = ref.split('|');
  return ix.formsOf.get(lemma)?.find((f) => f.id === ref);
}

// ---------- aspecto ----------
export const pairRef = (a: string, b: string) => `${a}>${b}`;
export function parsePairRef(ref: string): [string, string] {
  const [a, b] = ref.split('>');
  return [a, b];
}
