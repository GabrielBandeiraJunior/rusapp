'use client';
import { useEffect, useMemo, useState } from 'react';
import { phonetic, stripStress, transliterate } from '../../../shared/russian';
import { Practice } from '@/components/Practice';
import { useApp } from '@/components/Providers';
import { Ru } from '@/components/Ru';
import { Card, Page, Tabs } from '@/components/ui';
import { LETTERS, RULES, splitRich } from '@/lib/alphabet';
import { continueParam } from '@/lib/resume';

type Tab = 'letras' | 'regras' | 'praticar';

function Rich({ text }: { text: string }) {
  const { ix } = useApp();
  return (
    <>
      {splitRich(text).map((p, i) => {
        if (p.t === 'text') return <span key={i}>{p.v}</span>;
        const l = ix.lemma.get(p.v);
        if (!l) return null;
        return p.t === 'word' ? <Ru key={i} className="font-semibold">{l.s}</Ru> : <span key={i}>{phonetic(l.s)}</span>;
      })}
    </>
  );
}

function Letters() {
  const { ix } = useApp();
  const [sel, setSel] = useState('а');
  const info = LETTERS.find((l) => l.c === sel)!;
  const example = useMemo(
    () =>
      ix.content.lemmas.find((l) => stripStress(l.t).startsWith(sel) && l.t.length > 2) ??
      ix.content.lemmas.find((l) => l.t.includes(sel) && l.t.length > 2),
    [ix, sel],
  );
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5" data-testid="letter-grid">
        {LETTERS.map((l) => (
          <button
            key={l.c}
            onClick={() => setSel(l.c)}
            aria-pressed={sel === l.c}
            className={`min-h-12 rounded-xl border text-center ${sel === l.c ? 'border-brand bg-brand/15' : 'border-line bg-surface'}`}
          >
            <Ru className="block text-xl font-semibold leading-tight">{l.c.toUpperCase()} {l.c}</Ru>
            <span className="block text-[11px] text-muted">{l.c === 'е' ? 'ye/e' : transliterate(l.c) || '—'}</span>
          </button>
        ))}
      </div>
      <Card className="mt-3" >
        <p className="text-5xl"><Ru>{sel.toUpperCase()} {sel}</Ru></p>
        <p className="mt-1 text-lg" data-testid="letter-sound">{info.sound}</p>
        <p className="mt-1 text-sm text-muted">transliteração: <b>{sel === 'е' ? 'ye (início/após vogal) · e' : transliterate(sel) || '(sinal)'}</b></p>
        {example && (
          <p className="mt-3 border-t border-line pt-3">
            <Ru className="text-2xl">{example.s}</Ru> <span className="text-muted">[{phonetic(example.s)}] — {example.pt}</span>
          </p>
        )}
      </Card>
    </div>
  );
}

export default function AlphabetPage() {
  const [tab, setTab] = useState<Tab>('letras');
  useEffect(() => {
    if (continueParam() === 'read') setTab('praticar');
  }, []);
  return (
    <Page title="Alfabeto e leitura">
      <Tabs value={tab} onChange={setTab} items={[{ id: 'letras', label: 'Letras' }, { id: 'regras', label: 'Regras' }, { id: 'praticar', label: 'Praticar' }]} />
      {tab === 'letras' && <Letters />}
      {tab === 'regras' && (
        <div className="space-y-3">
          {RULES.map((r) => (
            <Card key={r.title}>
              <h2 className="font-bold">{r.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed"><Rich text={r.body} /></p>
            </Card>
          ))}
        </div>
      )}
      {tab === 'praticar' && (
        <>
          <Practice kind="read" />
        </>
      )}
    </Page>
  );
}
