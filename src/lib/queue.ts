// Filas de estudo: cartões devidos + novos (limitados por dia).
import { dayKey } from '../../shared/days';
import { syllableCount } from '../../shared/russian';
import type { ContentIndex } from './content';
import { gramKeys, keyRef, syllableOfStress, type GramFocus } from './grammar';
import { cardId, parseCardId, type CardKind, type CardRec, type ReviewRec } from './srs';
import { verbKeys, verbRef } from './verbs';

export interface QItem {
  cardId: string;
  kind: CardKind;
  ref: string;
  isNew: boolean;
}

export function dueItems(cards: CardRec[], kinds: CardKind[], now: number): QItem[] {
  return cards
    .filter((c) => kinds.includes(c.kind) && c.fsrs.reps > 0 && c.due <= now)
    .sort((a, b) => a.due - b.due)
    .map((c) => ({ cardId: c.id, kind: c.kind, ref: c.ref, isNew: false }));
}

/** Quantos cartões do tipo foram vistos pela 1ª vez hoje. */
export function newToday(reviews: ReviewRec[], kind: CardKind, tz: string, now: number): number {
  const first = new Map<string, number>();
  for (const r of reviews) {
    if (parseCardId(r.card).kind !== kind) continue;
    const cur = first.get(r.card);
    if (cur === undefined || r.ts < cur) first.set(r.card, r.ts);
  }
  const today = dayKey(now, tz);
  let n = 0;
  for (const ts of first.values()) if (dayKey(ts, tz) === today) n++;
  return n;
}

const shiftCache = new WeakMap<ContentIndex, string[]>();

/**
 * Formas flexionadas cujo acento cai em sílaba diferente da do lema (o acento móvel — a parte mais difícil do russo).
 * Devolve ids de `form` (sem repetir a mesma grafia acentuada num lema), em ordem de frequência do lema.
 */
export function stressShiftForms(ix: ContentIndex): string[] {
  const hit = shiftCache.get(ix);
  if (hit) return hit;
  const out: string[] = [];
  for (const l of ix.content.lemmas) {
    if (l.pos === 'other') continue;
    const base = syllableOfStress(l.s);
    const seen = new Set<string>([l.s]);
    for (const f of ix.formsOf.get(l.id) ?? []) {
      if (f.id.endsWith('|inan') || f.id.endsWith('|anim')) continue; // duplicam nominativo/genitivo
      const w = f.v[0];
      if (seen.has(w) || syllableCount(w) < 2) continue;
      seen.add(w);
      const s = syllableOfStress(w);
      if (base > 0 && s > 0 && s !== base) out.push(f.id);
    }
  }
  shiftCache.set(ix, out);
  return out;
}

export function newItems(
  ix: ContentIndex, cards: CardRec[], kind: CardKind, limit: number, focus: GramFocus = 'all',
): QItem[] {
  if (limit <= 0) return [];
  const has = new Set(cards.map((c) => c.id));
  const learnedVprod = new Set(cards.filter((c) => c.kind === 'vprod' && c.fsrs.reps > 0).map((c) => c.ref));
  const out: QItem[] = [];
  const push = (ref: string) => out.push({ cardId: cardId(kind, ref), kind, ref, isNew: true });
  if (kind === 'gram' || kind === 'verb') {
    const refs = kind === 'gram' ? gramKeys(ix, focus).map(keyRef) : verbKeys(ix).map(verbRef);
    for (const ref of refs) {
      if (out.length >= limit) break;
      if (!has.has(cardId(kind, ref))) push(ref);
    }
    return out;
  }
  for (const l of ix.content.lemmas) {
    if (out.length >= limit) break;
    if (has.has(cardId(kind, l.id))) continue;
    if (kind === 'vrec' && !learnedVprod.has(l.id)) continue;
    if (kind === 'stress' && (syllableCount(l.t) < 2 || !learnedVprod.has(l.id))) continue;
    if (kind === 'read' && syllableCount(l.t) < 2) continue;
    push(l.id);
  }
  if (kind === 'stress') {
    // depois das palavras-base: acento das formas flexionadas (de lemas que o aluno já estudou)
    for (const formId of stressShiftForms(ix)) {
      if (out.length >= limit) break;
      if (!learnedVprod.has(formId.slice(0, formId.indexOf('|')))) continue;
      if (!has.has(cardId('stress', formId))) push(formId);
    }
  }
  return out;
}

/** Fila final: devidos primeiro, depois novos até o orçamento do dia. */
export function buildQueue(
  ix: ContentIndex, cards: CardRec[], reviews: ReviewRec[], kind: CardKind, now: number,
  opts: { newPerDay: number; tz: string; focus?: GramFocus },
): QItem[] {
  const due = dueItems(cards, [kind], now);
  const budget = Math.max(0, opts.newPerDay - newToday(reviews, kind, opts.tz, now));
  return [...due, ...newItems(ix, cards, kind, budget, opts.focus)];
}

/** Lemas "conhecidos": com algum cartão de vocabulário/leitura já revisado. */
export function knownLemmas(cards: CardRec[]): Set<string> {
  const s = new Set<string>();
  for (const c of cards) {
    if (c.fsrs.reps > 0 && (c.kind === 'vprod' || c.kind === 'vrec' || c.kind === 'read')) s.add(c.ref);
  }
  return s;
}
