'use client';
import { useEffect, useState } from 'react';
import { Practice } from '@/components/Practice';
import { Page, Tabs } from '@/components/ui';
import { continueParam } from '@/lib/resume';

type Mode = 'vprod' | 'vrec' | 'stress';

export default function VocabPage() {
  const [mode, setMode] = useState<Mode>('vprod');
  useEffect(() => {
    const k = continueParam();
    if (k === 'vrec' || k === 'stress') setMode(k);
  }, []);
  return (
    <Page title="Vocabulário">
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { id: 'vprod', label: 'Digitar pt→ru' },
          { id: 'vrec', label: 'Reconhecer' },
          { id: 'stress', label: 'Acento' },
        ]}
      />
      <Practice
        key={mode}
        kind={mode}
        empty={mode === 'vprod' ? undefined : 'Aprenda palavras novas em “Digitar pt→ru” primeiro; elas aparecem aqui depois.'}
      />
    </Page>
  );
}
