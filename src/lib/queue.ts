// Filas de estudo: cartões devidos + novos (limitados por dia).
import { dayKey } from '../../shared/days';
import { syllableCount } from '../../shared/russian';
import type { ContentIndex } from './content';
import { gramKeys, keyRef, type GramFocus } from './grammar';
import { cardId, parseCardId, type CardKind, type CardRec, type ReviewRec } from './srs';

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

export function newItems(
  ix: ContentIndex, cards: CardRec[], kind: CardKind, limit: number, focus: GramFocus = 'all',
): QItem[] {
  if (limit <= 0) return [];
  const has = new Set(cards.map((c) => c.id));
  const learnedVprod = (id: string) => (cards.find((c) => c.id === cardId('vprod', id))?.fsrs.reps ?? 0) > 0;
  const out: QItem[] = [];
  const push = (ref: string) => out.push({ cardId: cardId(kind, ref), kind, ref, isNew: true });
  if (kind === 'gram') {
    for (const k of gramKeys(ix, focus)) {
      if (out.length >= limit) break;
      const ref = keyRef(k);
      if (!has.has(cardId('gram', ref))) push(ref);
    }
    return out;
  }
  for (const l of ix.content.lemmas) {
    if (out.length >= limit) break;
    if (has.has(cardId(kind, l.id))) continue;
    if (kind === 'vrec' && !learnedVprod(l.id)) continue;
    if (kind === 'stress' && (syllableCount(l.t) < 2 || !learnedVprod(l.id))) continue;
    if (kind === 'read' && syllableCount(l.t) < 2) continue;
    push(l.id);
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
