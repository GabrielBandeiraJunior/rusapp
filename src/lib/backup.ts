// Exportar/importar progresso (JSON). O estado dos cartões é recalculado das revisões — só elas são guardadas.
import type { Store } from './db';
import type { ReviewRec } from './srs';

export interface Backup {
  app: 'russo';
  v: 1;
  exportedAt: number;
  reviews: Omit<ReviewRec, 'synced'>[];
  settings: { key: string; value: string; updatedAt: number }[];
}

const SKIP_SETTINGS = new Set(['resume']);

export async function makeBackup(store: Store): Promise<Backup> {
  const reviews = (await store.allReviews()).map(({ synced: _s, ...r }) => {
    void _s;
    return r;
  });
  const settings = (await store.allSettings())
    .filter((s) => !SKIP_SETTINGS.has(s.key))
    .map((s) => ({ key: s.key, value: s.value, updatedAt: s.updatedAt }));
  return { app: 'russo', v: 1, exportedAt: Date.now(), reviews, settings };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

/** Valida o arquivo; lança Error com mensagem em pt-BR se não for um backup válido. */
export function parseBackup(text: string): Backup {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('Arquivo não é um JSON válido.');
  }
  const b = d as Partial<Backup>;
  if (!b || b.app !== 'russo' || b.v !== 1 || !Array.isArray(b.reviews) || !Array.isArray(b.settings)) throw new Error('Este arquivo não é um backup do Russo.');
  const reviews = b.reviews.filter(
    (r) => r && str(r.id) && str(r.card) && r.card.includes('|') && num(r.ts) && [1, 2, 3, 4].includes(r.rating) && (r.correct === 0 || r.correct === 1),
  ).map((r) => ({ id: r.id, card: r.card, rating: r.rating, ts: r.ts, resp: str(r.resp) ? r.resp : '', correct: r.correct, dev: str(r.dev) ? r.dev : '' }));
  const settings = b.settings.filter((s) => s && str(s.key) && str(s.value) && num(s.updatedAt) && !SKIP_SETTINGS.has(s.key));
  return { app: 'russo', v: 1, exportedAt: num(b.exportedAt) ? b.exportedAt : 0, reviews, settings };
}

export async function applyBackup(store: Store, b: Backup): Promise<{ reviews: number }> {
  const added = await store.importReviews(b.reviews);
  await store.ingestSettings(b.settings);
  return { reviews: added };
}
