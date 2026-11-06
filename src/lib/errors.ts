// "Meus erros": cartões cuja ÚLTIMA resposta foi errada (os mais recentes primeiro).
import type { QItem } from './queue';
import { parseCardId, type ReviewRec } from './srs';

export function errorItems(reviews: ReviewRec[], limit = 30): QItem[] {
  const last = new Map<string, ReviewRec>();
  for (const r of reviews) {
    const cur = last.get(r.card);
    if (!cur || r.ts > cur.ts) last.set(r.card, r);
  }
  return [...last.values()]
    .filter((r) => r.correct === 0)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((r) => {
      const { kind, ref } = parseCardId(r.card);
      return { cardId: r.card, kind, ref, isNew: false };
    });
}
