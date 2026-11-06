'use client';
import { useMemo, useState } from 'react';
import { phonetic } from '../../../shared/russian';
import type { TextDoc } from '../../../shared/types';
import { useApp } from '@/components/Providers';
import { Ru } from '@/components/Ru';
import { Speak } from '@/components/Speak';
import { Btn, Card, Page } from '@/components/ui';
import { knownLemmas } from '@/lib/queue';
import { band, rankTexts, textCoverage } from '@/lib/reading';

const BAND = {
  ideal: { label: 'faixa ideal', cls: 'bg-good/20 text-good' },
  facil: { label: 'fácil', cls: 'bg-brand/15 text-brand' },
  dificil: { label: 'difícil', cls: 'bg-warn/20 text-warn' },
} as const;

function Reader({ text, onBack }: { text: TextDoc; onBack: () => void }) {
  const { ix, cards } = useApp();
  const known = useMemo(() => knownLemmas(cards), [cards]);
  const cov = textCoverage(ix, text, known);
  const [sel, setSel] = useState<string | null>(null);
  const [showPt, setShowPt] = useState(false);
  const lemma = sel ? ix.lemma.get(sel) : null;
  const b = BAND[band(cov.pct)];
  return (
    <div>
      <button className="mb-2 min-h-11 text-brand" onClick={onBack}>← Textos</button>
      <h2 className="text-xl font-bold">{text.title}</h2>
      <p className="mb-3 mt-1 text-sm">
        <span data-testid="coverage" className={`rounded-full px-2 py-0.5 font-bold ${b.cls}`}>{cov.pct.toFixed(1).replace('.', ',')}% conhecidas</span>{' '}
        <span className="text-muted">({cov.known}/{cov.words} palavras) · {b.label}</span>
      </p>
      <Card>
        <div className="space-y-3 text-2xl leading-loose">
          {text.sentences.map((id) => {
            const s = ix.sentence.get(id)!;
            return (
              <p key={id} data-testid="sentence">
                {s.tk.map(([t, l, sp], i) => (
                  <span key={i}>
                    {sp ? ' ' : ''}
                    {l ? (
                      <button
                        data-testid="word"
                        onClick={() => setSel(l)}
                        className={`ru min-h-11 min-w-11 rounded-md px-0.5 underline decoration-dotted decoration-2 underline-offset-4 ${known.has(l) ? '' : 'bg-warn/20'}`}
                      >
                        {t}
                      </button>
                    ) : (
                      <Ru>{t}</Ru>
                    )}
                  </span>
                ))}
                {showPt && <span className="block text-base text-muted">{s.pt}</span>}
              </p>
            );
          })}
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted">Toque numa palavra para ver a tradução. Palavras sombreadas ainda não foram estudadas.</p>
      <Btn variant="ghost" className="mt-3 w-full" onClick={() => setShowPt((v) => !v)}>
        {showPt ? 'Ocultar tradução das frases' : 'Mostrar tradução das frases'}
      </Btn>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted">
        <Speak text={text.sentences.map((id) => ix.sentence.get(id)!.ru).join(' ')} /> ouvir o texto inteiro
      </div>
      {lemma && (
        <div
          role="dialog"
          aria-label="Tradução"
          data-testid="gloss"
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-line bg-surface p-5 shadow-2xl safe-bottom"
        >
          <div className="mx-auto flex max-w-md items-start justify-between gap-3">
            <div>
              <p className="text-3xl"><Ru>{lemma.s}</Ru> <Speak text={lemma.s} /></p>
              <p className="text-xl font-semibold">{lemma.pt}</p>
              <p className="text-sm text-muted">leitura: {phonetic(lemma.s)} · {known.has(lemma.id) ? 'já estudada' : 'nova'}</p>
            </div>
            <Btn variant="ghost" onClick={() => setSel(null)} aria-label="Fechar">✕</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReadingPage() {
  const { ix, cards } = useApp();
  const known = useMemo(() => knownLemmas(cards), [cards]);
  const ranked = useMemo(() => rankTexts(ix, known), [ix, known]);
  const [open, setOpen] = useState<TextDoc | null>(null);
  return (
    <Page title="Leitura graduada">
      {open ? (
        <Reader text={open} onBack={() => setOpen(null)} />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Textos curtos montados só com frases existentes. O ideal para aprender é entender de 95% a 98% das palavras — os textos
            mais próximos dessa faixa aparecem primeiro. Estude vocabulário para aumentar a %.
          </p>
          <ul className="space-y-2">
            {ranked.map(({ t, cov }) => {
              const b = BAND[band(cov.pct)];
              return (
                <li key={t.id}>
                  <button onClick={() => setOpen(t)} data-testid="text-item" className="flex min-h-16 w-full items-center justify-between rounded-2xl border border-line bg-surface p-3 text-left">
                    <span>
                      <span className="block font-semibold">{t.title}</span>
                      <span className="text-sm text-muted">{t.sentences.length} frases · {cov.words} palavras</span>
                    </span>
                    <span className={`rounded-full px-2 py-1 text-sm font-bold ${b.cls}`}>{cov.pct.toFixed(0)}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Page>
  );
}
