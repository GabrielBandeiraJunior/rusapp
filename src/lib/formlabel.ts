// Rótulo em português de uma forma flexionada (para exercícios de acento etc.).
import type { Form } from '../../shared/types';
import type { ContentIndex } from './content';
import { CASE_PT, GENDER_PT, NUM_PT } from './grammar';
import { promptVerb, type Person, type Tense } from './verbs';

export function describeForm(ix: ContentIndex, f: Form): string {
  const lemma = ix.lemma.get(f.l)!;
  if (lemma.pos === 'verb') {
    const k = { lemma: f.l, tn: f.tn as Tense, n: f.n!, ...(f.p ? { p: f.p as Person } : {}), ...(f.g ? { g: f.g } : {}) };
    return promptVerb(ix, k).tense;
  }
  const parts: string[] = [CASE_PT[f.c!]];
  if (lemma.pos === 'adj') parts.push(f.n === 'pl' ? 'plural' : `${GENDER_PT[f.g!]} singular`);
  else parts.push(NUM_PT[f.n!]);
  return parts.join(' · ');
}
