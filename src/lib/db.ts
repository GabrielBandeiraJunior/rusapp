// Persistência local (IndexedDB). O estado de cada cartão é DERIVADO das revisões (replay determinístico).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { replayCard, parseCardId, type CardRec, type ReviewRec } from './srs';

export interface SettingRec {
  key: string;
  value: string;
  updatedAt: number;
  dirty: 0 | 1;
}

interface Schema extends DBSchema {
  cards: { key: string; value: CardRec };
  reviews: { key: string; value: ReviewRec; indexes: { card: string; synced: number; ts: number } };
  settings: { key: string; value: SettingRec };
  meta: { key: string; value: { key: string; value: unknown } };
}

/** Arquivo de backup (exportar/importar progresso). */
export interface Backup {
  app: 'rusapp';
  version: 1;
  exportedAt: number;
  reviews: Omit<ReviewRec, 'synced'>[];
  settings: { key: string; value: string; updatedAt: number }[];
}

function newDeviceId(): string {
  try {
    return globalThis.crypto.randomUUID().slice(0, 12);
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

export class Store {
  private constructor(private db: IDBPDatabase<Schema>, readonly deviceId: string) {}

  static async open(name = 'rusapp'): Promise<Store> {
    const db = await openDB<Schema>(name, 1, {
      upgrade(d) {
        d.createObjectStore('cards', { keyPath: 'id' });
        const r = d.createObjectStore('reviews', { keyPath: 'id' });
        r.createIndex('card', 'card');
        r.createIndex('synced', 'synced');
        r.createIndex('ts', 'ts');
        d.createObjectStore('settings', { keyPath: 'key' });
        d.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    let dev = (await db.get('meta', 'deviceId'))?.value as string | undefined;
    if (!dev) {
      dev = newDeviceId();
      await db.put('meta', { key: 'deviceId', value: dev });
    }
    return new Store(db, dev);
  }

  close() {
    this.db.close();
  }

  // ----- meta
  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key))?.value as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    await this.db.put('meta', { key, value });
  }

  // ----- cartões
  getCard(id: string) {
    return this.db.get('cards', id);
  }
  allCards() {
    return this.db.getAll('cards');
  }

  // ----- revisões
  allReviews() {
    return this.db.getAll('reviews');
  }
  reviewsForCard(id: string) {
    return this.db.getAllFromIndex('reviews', 'card', id);
  }
  unsyncedReviews() {
    return this.db.getAllFromIndex('reviews', 'synced', 0);
  }
  async hasReview(id: string) {
    return !!(await this.db.get('reviews', id));
  }

  private counter = 0;

  /** Registra uma revisão e recalcula o cartão. Devolve ambos (a UI atualiza o estado sem reler tudo). */
  async recordReview(
    cardIdStr: string, rating: 1 | 2 | 3 | 4, correct: boolean, resp = '', ts = Date.now(),
  ): Promise<{ card: CardRec; review: ReviewRec }> {
    const review: ReviewRec = {
      id: `${this.deviceId}:${ts}:${this.counter++}`, card: cardIdStr, rating, ts, resp,
      correct: correct ? 1 : 0, dev: this.deviceId, synced: 0,
    };
    await this.db.put('reviews', review);
    return { card: await this.rebuildCard(cardIdStr), review };
  }

  async rebuildCard(cardIdStr: string): Promise<CardRec> {
    const { kind, ref } = parseCardId(cardIdStr);
    const reviews = await this.reviewsForCard(cardIdStr);
    const card = replayCard(kind, ref, reviews);
    await this.db.put('cards', card);
    return card;
  }

  /** Grava revisões que ainda não existem (uma única transação) e reconstrói os cartões afetados. */
  private async addReviews(reviews: Omit<ReviewRec, 'synced'>[], synced: 0 | 1): Promise<number> {
    const touched = new Set<string>();
    let added = 0;
    const tx = this.db.transaction('reviews', 'readwrite');
    for (const r of reviews) {
      if (await tx.store.get(r.id)) continue;
      await tx.store.put({ ...r, synced });
      touched.add(r.card);
      added++;
    }
    await tx.done;
    for (const c of touched) await this.rebuildCard(c);
    return added;
  }

  /** Aplica revisões vindas do servidor (idempotente por id). */
  ingestRemote(reviews: Omit<ReviewRec, 'synced'>[]): Promise<number> {
    return this.addReviews(reviews, 1);
  }

  async markSynced(ids: string[]) {
    const tx = this.db.transaction('reviews', 'readwrite');
    for (const id of ids) {
      const r = await tx.store.get(id);
      if (r && r.synced === 0) await tx.store.put({ ...r, synced: 1 });
    }
    await tx.done;
  }

  // ----- configurações (LWW por chave)
  async getSetting(key: string) {
    return (await this.db.get('settings', key))?.value;
  }
  async allSettings() {
    return this.db.getAll('settings');
  }
  async setSetting(key: string, value: string, at = Date.now()) {
    await this.db.put('settings', { key, value, updatedAt: at, dirty: 1 });
  }
  async dirtySettings() {
    return (await this.db.getAll('settings')).filter((s) => s.dirty === 1);
  }
  async ingestSettings(list: { key: string; value: string; updatedAt: number }[]) {
    for (const s of list) {
      const cur = await this.db.get('settings', s.key);
      if (!cur || s.updatedAt > cur.updatedAt) await this.db.put('settings', { ...s, dirty: 0 });
    }
  }
  async clearDirty(keys: string[], upTo: Record<string, number>) {
    for (const k of keys) {
      const cur = await this.db.get('settings', k);
      if (cur && cur.updatedAt <= upTo[k]) await this.db.put('settings', { ...cur, dirty: 0 });
    }
  }

  // ----- backup
  async exportBackup(now = Date.now()): Promise<Backup> {
    const reviews = (await this.allReviews()).map(({ synced: _s, ...r }) => (void _s, r));
    const settings = (await this.allSettings()).map((s) => ({ key: s.key, value: s.value, updatedAt: s.updatedAt }));
    return { app: 'rusapp', version: 1, exportedAt: now, reviews, settings };
  }

  /** Mescla um backup: revisões novas entram como "não enviadas" (sobem no próximo sync); configurações por LWW. */
  async importBackup(data: unknown): Promise<{ reviews: number; settings: number }> {
    const b = data as Partial<Backup> | null;
    if (!b || b.app !== 'rusapp' || b.version !== 1 || !Array.isArray(b.reviews) || !Array.isArray(b.settings))
      throw new Error('Arquivo de backup inválido.');
    const reviews = b.reviews.filter(
      (r) => r && typeof r.id === 'string' && typeof r.card === 'string' && typeof r.ts === 'number' && [1, 2, 3, 4].includes(r.rating),
    );
    const added = await this.addReviews(reviews, 0);
    let st = 0;
    for (const s of b.settings) {
      if (!s || typeof s.key !== 'string' || typeof s.value !== 'string' || typeof s.updatedAt !== 'number') continue;
      const cur = await this.db.get('settings', s.key);
      if (!cur || s.updatedAt > cur.updatedAt) {
        await this.db.put('settings', { key: s.key, value: s.value, updatedAt: s.updatedAt, dirty: 1 });
        st++;
      }
    }
    return { reviews: added, settings: st };
  }
}
