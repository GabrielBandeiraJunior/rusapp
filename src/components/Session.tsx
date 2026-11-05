'use client';
import { useEffect, useRef, useState } from 'react';
import type { QItem } from '@/lib/queue';
import { clearSession, saveSession, type SavedSession } from '@/lib/resume';
import { useApp } from './Providers';
import { Exercise, type Outcome } from './Exercises';
import { Bar, Btn, Card } from './ui';

/** Sessão: percorre a fila; erros voltam ao fim (1 vez) para praticar de novo. */
export function Session({ items, onExit, initial }: { items: QItem[]; onExit: () => void; initial?: SavedSession }) {
  const { review } = useApp();
  const [queue, setQueue] = useState<(QItem & { retry?: boolean })[]>(initial?.queue ?? items);
  const [idx, setIdx] = useState(initial?.idx ?? 0);
  const [stats, setStats] = useState(initial?.stats ?? { ok: 0, bad: 0 });
  const busy = useRef(false);
  const total = queue.length;
  const done = idx >= total;
  const kind = queue[0]?.kind;
  // guarda o ponto de retomada a cada avanço; ao concluir, limpa
  useEffect(() => {
    if (done) clearSession();
    else if (idx > 0 && kind) saveSession({ kind, queue, idx, stats, ts: Date.now() });
  }, [done, idx, kind, queue, stats]);

  if (done)
    return (
      <Card className="text-center" >
        <p className="text-2xl font-bold" data-testid="summary">Sessão concluída!</p>
        <p className="mt-2 text-lg">
          <span className="text-good">{stats.ok} acertos</span> · <span className="text-bad">{stats.bad} erros</span>
        </p>
        <Btn className="mt-3 w-full" onClick={onExit} data-testid="exit">
          Voltar
        </Btn>
      </Card>
    );

  const item = queue[idx];
  const handle = async (o: Outcome) => {
    if (busy.current) return; // toque duplo em "Continuar"
    busy.current = true;
    await review(item.cardId, o.rating, o.correct, o.resp);
    busy.current = false;
    setStats((s) => ({ ok: s.ok + (o.correct ? 1 : 0), bad: s.bad + (o.correct ? 0 : 1) }));
    if (!o.correct && !item.retry) setQueue((q) => [...q, { ...item, retry: true, isNew: false }]);
    setIdx((i) => i + 1);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button className="min-h-11 min-w-11 text-2xl text-muted" aria-label="Sair da sessão" onClick={onExit}>
          ✕
        </button>
        <div className="flex-1">
          <Bar value={idx} max={total} />
        </div>
        <span className="text-sm text-muted" data-testid="progress">{idx + 1}/{total}</span>
      </div>
      <Exercise key={`${item.cardId}-${idx}`} item={item} onDone={handle} />
    </div>
  );
}
