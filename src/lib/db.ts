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
      dev = Math.random().toString(36).slice(2, 10);
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

  /** Registra uma revisão e recalcula o cartão. */
  async recordReview(
    cardIdStr: string, rating: 1 | 2 | 3 | 4, correct: boolean, resp = '', ts = Date.now(),
  ): Promise<CardRec> {
    const rec: ReviewRec = {
      id: `${this.deviceId}:${ts}:${this.counter++}`, card: cardIdStr, rating, ts, resp,
      correct: correct ? 1 : 0, dev: this.deviceId, synced: 0,
    };
    await this.db.put('reviews', rec);
    return this.rebuildCard(cardIdStr);
  }

  async rebuildCard(cardIdStr: string): Promise<CardRec> {
    const { kind, ref } = parseCardId(cardIdStr);
    const reviews = await this.reviewsForCard(cardIdStr);
    const card = replayCard(kind, ref, reviews);
    await this.db.put('cards', card);
    return card;
  }

  /** Aplica revisões vindas do servidor (idempotente por id) e reconstrói os cartões afetados. */
  async ingestRemote(reviews: Omit<ReviewRec, 'synced'>[]): Promise<number> {
    const touched = new Set<string>();
    let added = 0;
    for (const r of reviews) {
      if (await this.hasReview(r.id)) continue;
      await this.db.put('reviews', { ...r, synced: 1 });
      touched.add(r.card);
      added++;
    }
    for (const c of touched) await this.rebuildCard(c);
    return added;
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
}
