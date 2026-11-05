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
      <Practice key={focus} kind="gram" focus={focus} />
    </Page>
  );
}
