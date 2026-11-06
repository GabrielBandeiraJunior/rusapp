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
        <p className="mt-2 text-sm text-muted">
          Atenção: as glosas em português foram redigidas com apoio de IA e <b>ainda não passaram por revisão humana</b>. Os níveis
          A1/A2/B1 são uma estimativa pela frequência da palavra, não uma classificação oficial. Já as formas dos casos e os
          acentos vêm só dos dados do OpenRussian. A voz do botão 🔊 é a do seu aparelho e não define o acento.
        </p>
      </Card>
      <p className="mt-4 text-center text-xs text-muted">Conteúdo v{ix.content.v}</p>
    </Page>
  );
}
