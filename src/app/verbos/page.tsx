'use client';
import { useEffect, useState } from 'react';
import { Practice } from '@/components/Practice';
import { useApp } from '@/components/Providers';
import { Ru } from '@/components/Ru';
import { Card, Page, Tabs } from '@/components/ui';
import { conjForm } from '@/lib/extra';
import { continueParam } from '@/lib/resume';

type Mode = 'conj' | 'aspect' | 'motion';

const MOTION_ROWS: [string, string][] = [
  ['v:идти|presfut_sg1', 'a pé, numa só direção, agora'],
  ['v:ходить|presfut_sg1', 'a pé, com frequência ou ida e volta'],
  ['v:ехать|presfut_sg1', 'de veículo, numa só direção, agora'],
  ['v:бегать|presfut_sg1', 'correr, com frequência ou sem destino fixo'],
];

/** Verbo em russo SEMPRE com o acento vindo dos dados. */
function W({ id }: { id: string }) {
  const { ix } = useApp();
  const l = ix.lemma.get(id);
  return l ? <Ru>{l.s}</Ru> : null;
}

function Motion() {
  const { ix } = useApp();
  return (
    <Card className="mb-3" data-testid="motion-lesson">
      <p className="font-bold">Verbos de movimento: duas famílias</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li><b>Determinado</b> (<W id="v:идти" />, <W id="v:ехать" />): um trajeto, uma direção, acontecendo agora.</li>
        <li><b>Indeterminado</b> (<W id="v:ходить" />, <W id="v:бегать" />): hábito, ida e volta, ou capacidade.</li>
        <li>Todos estes são imperfectivos. Com prefixo, o verbo vira perfectivo (<W id="v:пойти" />, <W id="v:прийти" />, <W id="v:уйти" />).</li>
      </ul>
      <ul className="mt-3 space-y-1">
        {MOTION_ROWS.map(([ref, note]) => {
          const f = conjForm(ix, ref)?.v[0];
          return f ? (
            <li key={ref} className="text-lg">
              <Ru>я {f}</Ru> <span className="text-sm text-muted">({note})</span>
            </li>
          ) : null;
        })}
      </ul>
    </Card>
  );
}

export default function VerbosPage() {
  const [mode, setMode] = useState<Mode>('conj');
  useEffect(() => {
    if (continueParam() === 'aspect') setMode('aspect');
  }, []);
  const empty = 'Aprenda verbos em “Vocabulário › Digitar” primeiro; os exercícios deles aparecem aqui.';
  return (
    <Page title="Verbos">
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { id: 'conj', label: 'Conjugação' },
          { id: 'aspect', label: 'Aspecto' },
          { id: 'motion', label: 'Movimento' },
        ]}
      />
      {mode === 'aspect' && (
        <Card className="mb-3">
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center font-bold">Entenda o aspecto</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              <li><b>Imperfectivo:</b> processo, hábito ou repetição («eu lia»).</li>
              <li><b>Perfectivo:</b> ação concluída, com resultado («eu li até o fim»).</li>
              <li>A forma conjugada de um perfectivo no «presente» tem sentido de futuro.</li>
            </ul>
          </details>
        </Card>
      )}
      {mode === 'motion' && <Motion />}
      {mode === 'aspect' ? <Practice key="aspect" kind="aspect" empty={empty} /> : <Practice key={mode} kind="conj" empty={empty} />}
    </Page>
  );
}
