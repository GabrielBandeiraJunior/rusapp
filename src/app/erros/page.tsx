'use client';
import { useEffect, useMemo, useState } from 'react';
import { Session } from '@/components/Session';
import { useApp } from '@/components/Providers';
import { Btn, Card, Page } from '@/components/ui';
import { errorItems } from '@/lib/errors';
import { continueParam, decodeSession, type SavedSession } from '@/lib/resume';

export default function ErrosPage() {
  const { reviews, settings, setResume } = useApp();
  const items = useMemo(() => errorItems(reviews), [reviews]);
  const saved = useMemo(() => {
    const s = decodeSession(settings.resume);
    return s?.mode === 'errors' ? s : null;
  }, [settings.resume]);
  const [session, setSession] = useState<typeof items | null>(null);
  const [resumed, setResumed] = useState<SavedSession | null>(null);
  useEffect(() => {
    if (saved && continueParam() === 'errors') setResumed(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const exit = () => {
    setSession(null);
    setResumed(null);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
  };
  const size = settings.sessionSize || 15;
  return (
    <Page title="Meus erros">
      {session || resumed ? (
        <Session items={session ?? resumed!.queue} initial={resumed ?? undefined} mode="errors" onExit={exit} />
      ) : (
        <Card>
          <p className="text-3xl font-bold" data-testid="error-count">{items.length}</p>
          <p className="text-sm text-muted">cartões em que sua última resposta foi errada</p>
          {saved && (
            <Btn className="mt-3 w-full" data-testid="resume" onClick={() => setResumed(saved)}>
              Continuar de onde parou ({saved.idx}/{saved.queue.length})
            </Btn>
          )}
          {items.length === 0 ? (
            <p className="mt-3 text-muted">Nenhum erro pendente. Bom trabalho!</p>
          ) : (
            <Btn
              variant={saved ? 'ghost' : 'primary'}
              className="mt-3 w-full"
              data-testid="start"
              onClick={() => {
                void setResume('');
                setSession(items.slice(0, size));
              }}
            >
              {saved ? 'Nova sessão' : 'Treinar meus erros'} ({Math.min(items.length, size)})
            </Btn>
          )}
        </Card>
      )}
    </Page>
  );
}
