import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Content } from '../shared/types';
import { applyBackup, makeBackup, parseBackup } from '../src/lib/backup';
import { Store } from '../src/lib/db';
import { indexContent } from '../src/lib/content';
import { errorItems } from '../src/lib/errors';
import { checkCloze, clozeList, conjForm, CONJ_COLS, formLabels, parseClozeRef, clozeRef } from '../src/lib/extra';
import { buildQueue } from '../src/lib/queue';
import { decodeSession, encodeSession, type SavedSession } from '../src/lib/resume';
import type { ReviewRec } from '../src/lib/srs';
import { lessonExamples } from '../src/lib/lessons';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8')) as Content;
const pairs = JSON.parse(readFileSync('public/data/verbpairs.json', 'utf8')) as [string, string][];
const ix = indexContent(content, pairs);

describe('retomada de sessão', () => {
  const base: SavedSession = {
    kind: 'vprod', idx: 2, ts: Date.now(), stats: { ok: 1, bad: 1 },
    queue: [
      { cardId: 'vprod|v:быть', kind: 'vprod', ref: 'v:быть', isNew: true },
      { cardId: 'vprod|n:дом', kind: 'vprod', ref: 'n:дом', isNew: false, retry: true },
      { cardId: 'vprod|n:мама', kind: 'vprod', ref: 'n:мама', isNew: false },
    ],
  };
  it('codifica e decodifica sem perder nada', () => {
    expect(decodeSession(encodeSession(base))).toEqual(base);
  });
  it('mantém o tipo de cada item em sessões de erros (tipos misturados)', () => {
    const s: SavedSession = {
      ...base, kind: 'gram', mode: 'errors',
      queue: [
        { cardId: 'gram|n:дом|dat|sg|-|-', kind: 'gram', ref: 'n:дом|dat|sg|-|-', isNew: false },
        { cardId: 'vprod|n:дом', kind: 'vprod', ref: 'n:дом', isNew: false },
        { cardId: 'aspect|v:делать>v:сделать', kind: 'aspect', ref: 'v:делать>v:сделать', isNew: false },
      ],
    };
    expect(decodeSession(encodeSession(s))).toEqual(s);
  });
  it('descarta sessão vencida, sem posição válida ou lixo', () => {
    expect(decodeSession(encodeSession({ ...base, ts: Date.now() - 40 * 3600e3 }))).toBeNull();
    expect(decodeSession(encodeSession({ ...base, idx: 0 }))).toBeNull();
    expect(decodeSession(encodeSession({ ...base, idx: 3 }))).toBeNull();
    expect(decodeSession('{')).toBeNull();
    expect(decodeSession('')).toBeNull();
  });
  it('cabe no limite do servidor (4000) mesmo com 30 perguntas de gramática', () => {
    const queue = Array.from({ length: 30 }, (_, i) => ({ cardId: `gram|n:слово${i}|prep|pl|-|-`, kind: 'gram' as const, ref: `n:слово${i}|prep|pl|-|-`, isNew: false }));
    expect(encodeSession({ ...base, kind: 'gram', queue, idx: 5 }).length).toBeLessThan(4000);
  });
});

describe('meus erros', () => {
  const rv = (card: string, ts: number, correct: 0 | 1): ReviewRec => ({ id: card + ts, card, rating: correct ? 3 : 1, ts, resp: '', correct, dev: 'x', synced: 0 });
  it('lista só cartões cuja última resposta foi errada, mais recentes primeiro', () => {
    const items = errorItems([
      rv('vprod|a', 1, 0), rv('vprod|a', 5, 1), // errou, depois acertou → não entra
      rv('gram|b', 2, 1), rv('gram|b', 6, 0), // acertou, depois errou → entra
      rv('vrec|c', 9, 0),
    ]);
    expect(items.map((i) => i.cardId)).toEqual(['vrec|c', 'gram|b']);
    expect(items[1].kind).toBe('gram');
  });
});

describe('backup', () => {
  it('rejeita arquivos que não são backup', () => {
    expect(() => parseBackup('nao é json')).toThrow(/JSON/);
    expect(() => parseBackup('{"a":1}')).toThrow(/backup/);
  });
  it('exporta e importa em outro aparelho, reconstruindo os cartões', async () => {
    const A = await Store.open('bk-a-' + Math.random());
    const B = await Store.open('bk-b-' + Math.random());
    await A.recordReview('vprod|n:дом', 3, true, 'дом');
    await A.recordReview('vprod|n:дом', 1, false, 'дым');
    await A.setSetting('dailyGoal', '33');
    await A.setSetting('resume', 'nao-exporta');
    const b = await makeBackup(A);
    expect(b.settings.some((s) => s.key === 'resume')).toBe(false);
    const parsed = parseBackup(JSON.stringify(b));
    const r = await applyBackup(B, parsed);
    expect(r.reviews).toBe(2);
    expect((await B.getCard('vprod|n:дом'))?.fsrs.reps).toBe(2);
    expect(await B.getSetting('dailyGoal')).toBe('33');
    expect((await B.unsyncedReviews()).length).toBe(2); // ficam pendentes para o sync
    expect((await applyBackup(B, parsed)).reviews).toBe(0); // idempotente
  });
});

describe('frases com lacuna', () => {
  const list = clozeList(ix);
  it('há frases suficientes e cada resposta é uma forma confirmada nos dados', () => {
    expect(list.length).toBeGreaterThan(20);
    for (const c of list) {
      const [word, lid] = ix.sentence.get(c.sid)!.tk[c.i];
      expect(formLabels(ix, lid, word).length, `${c.sid}#${c.i}`).toBeGreaterThan(0);
    }
  });
  it('referência de cartão faz ida e volta', () => {
    expect(parseClozeRef(clozeRef(list[0]))).toEqual(list[0]);
  });
  it('aceita sem acento e com maiúsculas, rejeita palavra errada', () => {
    expect(checkCloze('СЕМЬЯ', 'семья́')).toBe(true);
    expect(checkCloze('семью', 'семья́')).toBe(false);
  });
});

describe('verbos', () => {
  it('pares de aspecto: ambos os verbos existem e têm aspectos opostos', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(20);
    for (const [a, b] of pairs) {
      const la = ix.lemma.get(a)!, lb = ix.lemma.get(b)!;
      expect(la && lb, `${a} ${b}`).toBeTruthy();
      expect(la.asp).not.toBe(lb.asp);
    }
  });
  it('conjugação: cada coluna pedida resolve para uma forma dos dados, com acento', () => {
    let n = 0;
    for (const l of content.lemmas.filter((x) => x.pos === 'verb')) {
      for (const col of CONJ_COLS) {
        const f = conjForm(ix, `${l.id}|${col}`);
        if (f) {
          n++;
          expect(f.v.length).toBeGreaterThan(0);
        }
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(conjForm(ix, 'v:идти|presfut_sg1')?.v[0]).toBe('иду́');
  });
  it('só pede conjugação/aspecto de verbos já aprendidos no vocabulário', () => {
    const now = Date.now();
    const opts = { newPerDay: 50, tz: 'America/Sao_Paulo' };
    expect(buildQueue(ix, [], [], 'conj', now, opts)).toEqual([]);
    expect(buildQueue(ix, [], [], 'aspect', now, opts)).toEqual([]);
    const learned = {
      id: 'vprod|v:делать', kind: 'vprod' as const, ref: 'v:делать', due: now + 1e9, updatedAt: now,
      fsrs: { due: now, stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0, state: 2 },
    };
    expect(buildQueue(ix, [learned], [], 'aspect', now, opts).some((q) => q.ref.startsWith('v:делать>'))).toBe(true);
    expect(buildQueue(ix, [learned], [], 'conj', now, opts).every((q) => q.ref.startsWith('v:делать|'))).toBe(true);
  });
});

describe('mini-lições', () => {
  it('os exemplos vêm das formas dos dados (com acento)', () => {
    const ex = lessonExamples(ix, 'prep');
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.find((e) => e.pre === 'в')?.ru).toBe('до́ме');
  });
});
