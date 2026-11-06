'use client';
import { useEffect, useState } from 'react';
import { Lesson } from '@/components/Lesson';
import { Practice } from '@/components/Practice';
import { Page, Tabs } from '@/components/ui';
import type { GramFocus } from '@/lib/grammar';
import { continueParam } from '@/lib/resume';

export default function GramPage() {
  const [focus, setFocus] = useState<GramFocus>('all');
  const [mode, setMode] = useState<'forms' | 'phrases'>('forms');
  useEffect(() => {
    if (continueParam() === 'cloze') setMode('phrases');
  }, []);
  return (
    <Page title="Casos">
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { id: 'forms', label: 'Formas' },
          { id: 'phrases', label: 'Em frases' },
        ]}
      />
      {mode === 'phrases' ? (
        <Practice key="cloze" kind="cloze" empty="Nenhuma frase pendente agora." />
      ) : (
        <>
          <Tabs
            value={focus}
            onChange={setFocus}
            items={[
              { id: 'all', label: 'Tudo' },
              { id: 'nom', label: 'Nom.' },
              { id: 'acc', label: 'Acus.' },
              { id: 'gen', label: 'Gen.' },
              { id: 'dat', label: 'Dat.' },
              { id: 'inst', label: 'Inst.' },
              { id: 'prep', label: 'Prep.' },
            ]}
          />
          <Lesson focus={focus} />
          <Practice key={focus} kind="gram" focus={focus} />
        </>
      )}
    </Page>
  );
}
