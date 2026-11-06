// Exportar/importar progresso (arquivo JSON). O estado dos cartões é derivado das revisões,
// então o backup só precisa das revisões e das configurações.
import type { Store } from './db';
import type { ReviewRec } from './srs';

export const BACKUP_FORMAT = 'rusapp-backup';
export const BACKUP_VERSION = 1;

type BackupReview = Omit<ReviewRec, 'synced'>;
interface BackupSetting { key: string; value: string; updatedAt: number }

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  reviews: BackupReview[];
  settings: BackupSetting[];
}

export async function exportBackup(store: Store, now = Date.now()): Promise<Backup> {
  const [reviews, settings] = await Promise.all([store.allReviews(), store.allSettings()]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    reviews: reviews
      .map(({ synced: _s, ...r }) => (void _s, r))
      .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1)),
    settings: settings.map((s) => ({ key: s.key, value: s.value, updatedAt: s.updatedAt })),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Valida e normaliza um backup lido de arquivo. Lança Error com mensagem em pt-BR. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Arquivo inválido: não é JSON.');
  }
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('Este arquivo não é um backup do Russo.');
  if (!isNum(b.version) || b.version > BACKUP_VERSION) throw new Error('Backup de uma versão mais nova do app.');
  if (!Array.isArray(b.reviews) || !Array.isArray(b.settings)) throw new Error('Backup incompleto.');
  const reviews: BackupReview[] = [];
  for (const r of b.reviews as Partial<BackupReview>[]) {
    if (!r || !isStr(r.id) || !r.id || !isStr(r.card) || !r.card.includes('|') || !isNum(r.ts)) continue;
    if (![1, 2, 3, 4].includes(r.rating as number)) continue;
    reviews.push({
      id: r.id, card: r.card, rating: r.rating as 1 | 2 | 3 | 4, ts: r.ts,
      resp: isStr(r.resp) ? r.resp.slice(0, 200) : '', correct: r.correct ? 1 : 0, dev: isStr(r.dev) ? r.dev.slice(0, 32) : '',
    });
  }
  const settings: BackupSetting[] = [];
  for (const s of b.settings as Partial<BackupSetting>[]) {
    if (s && isStr(s.key) && s.key && isStr(s.value) && isNum(s.updatedAt)) settings.push({ key: s.key, value: s.value, updatedAt: s.updatedAt });
  }
  return { format: BACKUP_FORMAT, version: b.version, exportedAt: isNum(b.exportedAt) ? b.exportedAt : 0, reviews, settings };
}

/** Mescla o backup no armazenamento local (idempotente). Retorna o número de revisões novas. */
export async function importBackup(store: Store, text: string): Promise<number> {
  const b = parseBackup(text);
  return store.importBackup(b.reviews, b.settings);
}
