'use client';
import { useState } from 'react';
import { Practice } from '@/components/Practice';
import { Page, Tabs } from '@/components/ui';

type Mode = 'vprod' | 'vrec' | 'stress';

export default function VocabPage() {
  const [mode, setMode] = useState<Mode>('vprod');
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
      <p className="mb-3 text-sm text-muted">
        {mode === 'vprod' && 'Você vê a tradução e DIGITA a palavra em russo. Produção fixa muito mais que reconhecimento.'}
        {mode === 'vrec' && 'Você vê a palavra em russo, lembra o significado e se avalia. Libera depois que você digitou a palavra.'}
        {mode === 'stress' && 'Toque na vogal tônica. Libera depois que você digitou a palavra.'}
      </p>
      <Practice
        key={mode}
        kind={mode}
        empty={mode === 'vprod' ? undefined : 'Aprenda palavras novas em “Digitar pt→ru” primeiro; elas aparecem aqui depois.'}
      />
    </Page>
  );
}
