'use client';
import { parseCardId } from '@/lib/srs';
import { GramEx } from './GramEx';
import { ReadEx } from './ReadEx';
import { StressEx } from './StressEx';
import { VerbEx } from './VerbEx';
import { VocabProdEx } from './VocabProdEx';
import { VocabRecEx } from './VocabRecEx';
import type { ExProps } from './shared';

export type { Outcome } from './shared';

/** Despacha o exercício certo pelo tipo do cartão. */
export function Exercise({ item, onDone }: ExProps) {
  switch (parseCardId(item.cardId).kind) {
    case 'vprod': return <VocabProdEx item={item} onDone={onDone} />;
    case 'vrec': return <VocabRecEx item={item} onDone={onDone} />;
    case 'stress': return <StressEx item={item} onDone={onDone} />;
    case 'gram': return <GramEx item={item} onDone={onDone} />;
    case 'verb': return <VerbEx item={item} onDone={onDone} />;
    case 'read': return <ReadEx item={item} onDone={onDone} />;
  }
}
