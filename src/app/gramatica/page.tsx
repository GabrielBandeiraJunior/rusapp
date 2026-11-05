'use client';
import { useState } from 'react';
import { Practice } from '@/components/Practice';
import { Page, Tabs } from '@/components/ui';
import type { GramFocus } from '@/lib/grammar';

export default function GramPage() {
  const [focus, setFocus] = useState<GramFocus>('all');
  return (
    <Page title="Casos">
      <Tabs
        value={focus}
        onChange={setFocus}
        items={[
          { id: 'all', label: 'Tudo' },
          { id: 'nom', label: 'Nom.' },
          { id: 'acc', label: 'Acus.' },
          { id: 'gen', label: 'Gen.' },
        ]}
      />
      <p className="mb-3 text-sm text-muted">
        Dado o lema, o caso e o número, <b>digite a forma</b>. O feedback explica a regra e mostra a forma correta com acento.
        Substantivos primeiro (nom. pl. → acus. sg. → gen. sg. → gen. pl. → acus. pl.), depois adjetivos.
      </p>
      <Practice key={focus} kind="gram" focus={focus} />
    </Page>
  );
}
