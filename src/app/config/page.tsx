'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp, useSync } from '@/components/Providers';
import { Btn, Card, Page } from '@/components/ui';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const numCls = 'min-h-11 w-24 rounded-lg border border-line bg-bg px-3 text-right';

/** Campo numérico: edita como texto (dá para apagar e digitar) e só grava ao sair do campo / Enter. */
function NumField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return setText(String(value));
    const v = Math.min(max, Math.max(min, Math.round(n)));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      aria-label={label} type="number" inputMode="numeric" min={min} max={max} className={numCls} value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function Backup() {
  const { store, reload } = useApp();
  const { syncNow } = useSync();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const exportIt = async () => {
    const data = await store.exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `russo-progresso-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setMsg(`Exportado: ${data.reviews.length} revisões.`);
  };
  const importIt = async (f: File) => {
    try {
      const r = await store.importBackup(JSON.parse(await f.text()));
      await reload();
      void syncNow();
      setMsg(`Importado: ${r.reviews} revisões novas, ${r.settings} configurações.`);
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    }
  };
  return (
    <Card>
      <p className="mb-2 text-sm text-muted">
        Guarde uma cópia do seu progresso (revisões e configurações). Importar mescla com o que já existe — nada é apagado.
      </p>
      <div className="flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={() => void exportIt()}>Exportar</Btn>
        <Btn variant="ghost" className="flex-1" onClick={() => file.current?.click()}>Importar</Btn>
        <input
          ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Arquivo de backup"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importIt(f); e.target.value = ''; }}
        />
      </div>
      {msg && <p className="mt-2 text-sm text-muted" data-testid="backup-msg">{msg}</p>}
    </Card>
  );
}

export default function ConfigPage() {
  const { settings, update, ix } = useApp();
  const { getSyncConfig, setSyncConfig, syncNow, syncStatus, syncMessage } = useSync();
  const saved = getSyncConfig();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [token, setToken] = useState(saved?.token ?? '');
  const [tz, setTz] = useState(settings.tz);
  const [tzErr, setTzErr] = useState('');

  const saveTz = () => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      setTzErr('');
      if (tz !== settings.tz) void update('tz', tz);
    } catch {
      setTzErr('Fuso inválido (ex.: America/Sao_Paulo)');
    }
  };

  return (
    <Page title="Configurações" right={<Link href="/sobre/" className="flex min-h-11 min-w-11 items-center justify-center text-brand">Sobre</Link>}>
      <Card>
        <Row label="Meta diária" hint="revisões por dia">
          <NumField label="Meta diária" min={1} max={500} value={settings.dailyGoal} onCommit={(n) => void update('dailyGoal', n)} />
        </Row>
        <Row label="Novos por dia" hint="por tipo de exercício">
          <NumField label="Novos por dia" min={0} max={100} value={settings.newPerDay} onCommit={(n) => void update('newPerDay', n)} />
        </Row>
        <Row label="Fuso horário" hint="define a virada do dia">
          <input aria-label="Fuso horário" className="min-h-11 w-44 rounded-lg border border-line bg-bg px-3" value={tz} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setTz(e.target.value)} onBlur={saveTz} />
        </Row>
        {tzErr && <p className="text-sm text-bad">{tzErr}</p>}
        <Row label="Congelar ofensiva" hint="a cada 7 dias seguidos ganha 1 congelamento (máx. 2) que cobre um dia perdido">
          <input aria-label="Congelar ofensiva" type="checkbox" className="h-7 w-7" checked={settings.freeze} onChange={(e) => void update('freeze', e.target.checked)} />
        </Row>
      </Card>

      <h2 className="mb-2 mt-5 text-lg font-bold">Sincronização</h2>
      <Card>
        <p className="mb-2 text-sm text-muted">Seu progresso fica no aparelho (IndexedDB). Com URL e token do seu Worker, ele é sincronizado entre aparelhos e funciona offline.</p>
        <input aria-label="URL do Worker" placeholder="https://rusapp-api.SEU-USUARIO.workers.dev" className="mb-2 min-h-12 w-full rounded-lg border border-line bg-bg px-3" value={url} onChange={(e) => setUrl(e.target.value)}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" />
        <input aria-label="Token" placeholder="token (APP_TOKEN)" type="password" className="mb-3 min-h-12 w-full rounded-lg border border-line bg-bg px-3" value={token} onChange={(e) => setToken(e.target.value)}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => { setSyncConfig(url.trim() && token.trim() ? { url: url.trim(), token: token.trim() } : null); void syncNow(); }}>Salvar e sincronizar</Btn>
          <Btn variant="ghost" onClick={() => { setSyncConfig(null); setUrl(''); setToken(''); }}>Desligar</Btn>
        </div>
        <p className="mt-2 text-sm text-muted" data-testid="sync-state">
          {syncStatus === 'off' ? 'Desligada.' : syncStatus === 'ok' ? `Em dia ${syncMessage}` : syncStatus === 'error' ? `Erro: ${syncMessage}` : syncStatus === 'syncing' ? 'Sincronizando…' : 'Ativa.'}
        </p>
      </Card>

      <h2 className="mb-2 mt-5 text-lg font-bold">Backup do progresso</h2>
      <Backup />
      <p className="mt-4 text-center text-xs text-muted">Conteúdo v{ix.content.v} · {ix.content.lemmas.length} palavras · {ix.content.sentences.length} frases</p>
    </Page>
  );
}
