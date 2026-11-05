'use client';
import { useMemo, useState } from 'react';
import type { GramFocus } from '@/lib/grammar';
import { buildQueue, type QItem } from '@/lib/queue';
import type { CardKind } from '@/lib/srs';
import { useApp } from './Providers';
import { Session } from './Session';
import { Btn, Card } from './ui';

const ROUND = 15;

/** Cartão de entrada de um modo de prática: mostra devidos/novos e inicia a sessão. */
export function Practice({ kind, focus = 'all', empty }: { kind: CardKind; focus?: GramFocus; empty?: string }) {
  const { ix, cards, reviews, settings } = useApp();
  const [session, setSession] = useState<QItem[] | null>(null);
  const [round, setRound] = useState(0);
  const queue = useMemo(
    () => buildQueue(ix, cards, reviews, kind, Date.now(), { newPerDay: settings.newPerDay, tz: settings.tz, focus }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ix, cards, reviews, kind, focus, settings.newPerDay, settings.tz, round],
  );
  const due = queue.filter((q) => !q.isNew).length;
  const fresh = queue.length - due;

  if (session)
    return (
      <Session
        key={round}
        items={session}
        onExit={() => {
          setSession(null);
          setRound((r) => r + 1);
        }}
      />
    );
  return (
    <Card>
      <div className="flex gap-6">
        <div>
          <p className="text-3xl font-bold" data-testid="due-count">{due}</p>
          <p className="text-sm text-muted">para revisar</p>
        </div>
        <div>
          <p className="text-3xl font-bold" data-testid="new-count">{fresh}</p>
          <p className="text-sm text-muted">novos hoje</p>
        </div>
      </div>
      {queue.length === 0 ? (
        <p className="mt-3 text-muted">{empty ?? 'Nada pendente agora. Volte mais tarde — ou aumente os novos por dia em Configurações.'}</p>
      ) : (
        <Btn className="mt-4 w-full" data-testid="start" onClick={() => setSession(queue.slice(0, ROUND))}>
          Começar ({Math.min(queue.length, ROUND)})
        </Btn>
      )}
    </Card>
  );
}
