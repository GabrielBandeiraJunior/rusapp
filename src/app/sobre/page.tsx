'use client';
import { useApp } from '@/components/Providers';
import { Card, Page } from '@/components/ui';

export default function AboutPage() {
  const { ix } = useApp();
  return (
    <Page title="Sobre e licenças">
      <Card>
        <p>
          Este app ensina o <b>sistema</b> do russo (casos, leitura, acento) exigindo que você <b>digite</b> as formas. Acentos e formas
          gramaticais vêm de dados abertos — nunca de um modelo de linguagem.
        </p>
      </Card>
      <h2 className="mb-2 mt-5 text-lg font-bold">Fontes de dados e atribuições</h2>
      <ul className="space-y-3" data-testid="attributions">
        {ix.content.attributions.map((a) => (
          <li key={a.name}>
            <Card>
              <p className="font-semibold">{a.name}</p>
              <p className="text-sm text-muted">Licença: {a.license}</p>
              <p className="mt-1 text-sm">{a.note}</p>
              <p className="mt-1 break-all text-sm text-brand">{a.url}</p>
            </Card>
          </li>
        ))}
      </ul>
      <h2 className="mb-2 mt-5 text-lg font-bold">Conteúdo autoral</h2>
      <Card>
        <p className="text-sm">
          As glosas em português e as frases/textos de leitura foram escritos para este projeto. As formas flexionadas usadas
          nas frases são validadas contra a tabela de flexão (OpenRussian). Revise e corrija o que encontrar.
        </p>
      </Card>
      <p className="mt-4 text-center text-xs text-muted">Conteúdo v{ix.content.v}</p>
    </Page>
  );
}
