'use client';
import { useEffect, useState } from 'react';
import { Practice } from '@/components/Practice';
import { Page, Tabs } from '@/components/ui';
import type { GramFocus } from '@/lib/grammar';
import { continueParam } from '@/lib/resume';

type Mode = 'casos' | 'verbos';

export default function GramPage() {
  const [mode, setMode] = useState<Mode>('casos');
  const [focus, setFocus] = useState<GramFocus>('all');
  useEffect(() => {
    if (continueParam() === 'verb') setMode('verbos');
  }, []);
  return (
    <Page title="Gramática">
      <Tabs value={mode} onChange={setMode} items={[{ id: 'casos', label: 'Casos' }, { id: 'verbos', label: 'Verbos' }]} />
      {mode === 'casos' ? (
        <>
          <Tabs
            scroll
            value={focus}
            onChange={setFocus}
            items={[
              { id: 'all', label: 'Tudo' },
              { id: 'nom', label: 'Nom.' },
              { id: 'acc', label: 'Acus.' },
              { id: 'gen', label: 'Gen.' },
              { id: 'prep', label: 'Prep.' },
              { id: 'dat', label: 'Dat.' },
              { id: 'inst', label: 'Inst.' },
            ]}
          />
          <Practice key={`gram-${focus}`} kind="gram" focus={focus} />
        </>
      ) : (
        <Practice
          key="verb"
          kind="verb"
          empty="Nada pendente agora. Volte mais tarde — ou aumente os novos por dia em Configurações."
        />
      )}
    </Page>
  );
}
