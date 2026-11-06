import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup, parseBackup } from '../src/lib/backup';
import { Store } from '../src/lib/db';

const uid = () => Math.random().toString(36).slice(2);

describe('backup do progresso', () => {
  it('exporta num aparelho e importa em outro: mesmo estado dos cartões, idempotente, marcado para sync', async () => {
    const A = await Store.open('bkA-' + uid());
    const B = await Store.open('bkB-' + uid());
    await A.recordReview('vprod|n:дом', 3, true, 'дом', 1_000);
    await A.recordReview('vprod|n:дом', 1, false, 'дим', 2_000);
    await A.recordReview('stress|n:вода', 3, true, 'вода', 3_000);
    await A.setSetting('dailyGoal', '42', 5_000);

    const text = JSON.stringify(await exportBackup(A, 9_999));
    expect(await importBackup(B, text)).toBe(3);
    expect(await importBackup(B, text)).toBe(0); // idempotente

    expect((await B.getCard('vprod|n:дом'))?.fsrs).toEqual((await A.getCard('vprod|n:дом'))?.fsrs);
    expect(await B.getSetting('dailyGoal')).toBe('42');
    expect((await B.unsyncedReviews()).length).toBe(3); // serão enviadas ao Worker no próximo sync
    expect((await B.dirtySettings()).map((s) => s.key)).toContain('dailyGoal');
  });

  it('não sobrescreve configuração local mais nova', async () => {
    const A = await Store.open('bkC-' + uid());
    const B = await Store.open('bkD-' + uid());
    await A.setSetting('dailyGoal', '10', 1_000);
    await B.setSetting('dailyGoal', '99', 2_000);
    await importBackup(B, JSON.stringify(await exportBackup(A)));
    expect(await B.getSetting('dailyGoal')).toBe('99');
  });

  it('rejeita arquivos que não são backup e ignora linhas inválidas', () => {
    expect(() => parseBackup('não é json')).toThrow(/JSON/);
    expect(() => parseBackup('{"format":"outro"}')).toThrow(/não é um backup/);
    expect(() => parseBackup('{"format":"rusapp-backup","version":99,"reviews":[],"settings":[]}')).toThrow(/mais nova/);
    expect(() => parseBackup('{"format":"rusapp-backup","version":1}')).toThrow(/incompleto/);
    const b = parseBackup(JSON.stringify({
      format: 'rusapp-backup', version: 1, exportedAt: 1,
      reviews: [{ id: 'a:1:0', card: 'vprod|x', rating: 3, ts: 1, resp: 'r', correct: 1, dev: 'a' }, { id: 'ruim', card: 'sem-barra', rating: 3, ts: 1 }, { id: 'r2', card: 'a|b', rating: 9, ts: 1 }, null],
      settings: [{ key: 'k', value: 'v', updatedAt: 1 }, { key: 'k2' }],
    }));
    expect(b.reviews).toHaveLength(1);
    expect(b.settings).toHaveLength(1);
  });
});
