'use client';
import { useEffect, useMemo, useState } from 'react';
import type { GramFocus } from '@/lib/grammar';
import { buildQueue, type QItem } from '@/lib/queue';
import { clearSession, continueParam, loadSession, type SavedSession } from '@/lib/resume';
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
  const [saved, setSaved] = useState<SavedSession | null>(null);
  const [resumed, setResumed] = useState<SavedSession | null>(null);
  useEffect(() => {
    const s = loadSession();
    const mine = s && s.kind === kind ? s : null;
    setSaved(mine);
    if (mine && continueParam() === kind) setResumed(mine); // veio do botão "Continuar" da tela inicial
  }, [kind, round]);
  const queue = useMemo(
    () => buildQueue(ix, cards, reviews, kind, Date.now(), { newPerDay: settings.newPerDay, tz: settings.tz, focus }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ix, cards, reviews, kind, focus, settings.newPerDay, settings.tz, round],
  );
  const due = queue.filter((q) => !q.isNew).length;
  const fresh = queue.length - due;

  if (session || resumed)
    return (
      <Session
        key={round}
        items={session ?? resumed!.queue}
        initial={resumed ?? undefined}
        onExit={() => {
          setSession(null);
          setResumed(null);
          if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
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
      {saved && (
        <Btn className="mt-3 w-full" data-testid="resume" onClick={() => setResumed(saved)}>
          Continuar de onde parou ({saved.idx}/{saved.queue.length})
        </Btn>
      )}
      {queue.length === 0 ? (
        <p className="mt-3 text-muted">{empty ?? 'Nada pendente agora. Volte mais tarde — ou aumente os novos por dia em Configurações.'}</p>
      ) : (
        <Btn variant={saved ? 'ghost' : 'primary'} className="mt-3 w-full" data-testid="start" onClick={() => { clearSession(); setSaved(null); setSession(queue.slice(0, ROUND)); }}>
          {saved ? 'Nova sessão' : 'Começar'} ({Math.min(queue.length, ROUND)})
        </Btn>
      )}
    </Card>
  );
}
