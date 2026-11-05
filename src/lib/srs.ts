// Agendamento FSRS (ts-fsrs) — executa no cliente. Estado do cartão = função pura da sequência de revisões.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';

export { Rating, State };

export type CardKind = 'vprod' | 'vrec' | 'stress' | 'gram' | 'read';

/** Estado FSRS serializável (JSON). */
export interface FsrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

export interface CardRec {
  id: string; // `${kind}|${ref}`
  kind: CardKind;
  ref: string;
  fsrs: FsrsState;
  due: number;
  updatedAt: number;
}

export interface ReviewRec {
  id: string;
  card: string;
  rating: 1 | 2 | 3 | 4;
  ts: number;
  resp: string;
  correct: 0 | 1;
  dev: string;
  /** 0 = ainda não enviado ao servidor (campo local) */
  synced: 0 | 1;
}

// fuzz desligado: o agendamento precisa ser determinístico para convergir entre aparelhos
const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));

export function cardId(kind: CardKind, ref: string) {
  return `${kind}|${ref}`;
}

export function parseCardId(id: string): { kind: CardKind; ref: string } {
  const i = id.indexOf('|');
  return { kind: id.slice(0, i) as CardKind, ref: id.slice(i + 1) };
}

function toState(c: Card): FsrsState {
  return {
    due: c.due.getTime(), stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days, reps: c.reps, lapses: c.lapses, state: c.state,
    last_review: c.last_review?.getTime(),
  };
}

function fromState(s: FsrsState): Card {
  return {
    due: new Date(s.due), stability: s.stability, difficulty: s.difficulty, elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days, reps: s.reps, lapses: s.lapses, state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}

export function emptyState(at: number): FsrsState {
  return toState(createEmptyCard(new Date(at)));
}

export function applyRating(state: FsrsState, rating: 1 | 2 | 3 | 4, at: number): FsrsState {
  return toState(scheduler.next(fromState(state), new Date(at), rating as Grade).card);
}

/** Reconstrói um cartão a partir de TODAS as suas revisões (ordem total: ts, id). */
export function replayCard(kind: CardKind, ref: string, reviews: ReviewRec[]): CardRec {
  const sorted = [...reviews].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let st = emptyState(sorted[0]?.ts ?? 0);
  for (const r of sorted) st = applyRating(st, r.rating, r.ts);
  return {
    id: cardId(kind, ref), kind, ref, fsrs: st, due: st.due, updatedAt: sorted[sorted.length - 1]?.ts ?? 0,
  };
}

export function isLearned(c: CardRec | undefined): boolean {
  return !!c && c.fsrs.reps > 0;
}
