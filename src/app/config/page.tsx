'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useApp } from '@/components/Providers';
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

export default function ConfigPage() {
  const { settings, update, getSyncConfig, setSyncConfig, syncNow, syncStatus, syncMessage, ix } = useApp();
  const saved = getSyncConfig();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [token, setToken] = useState(saved?.token ?? '');
  const [tz, setTz] = useState(settings.tz);
  const [tzErr, setTzErr] = useState('');

  const saveTz = () => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      setTzErr('');
      void update('tz', tz);
    } catch {
      setTzErr('Fuso inválido (ex.: America/Sao_Paulo)');
    }
  };

  return (
    <Page title="Configurações" right={<Link href="/sobre/" className="flex min-h-11 min-w-11 items-center justify-center text-brand">Sobre</Link>}>
      <Card>
        <Row label="Meta diária" hint="revisões por dia">
          <input aria-label="Meta diária" type="number" inputMode="numeric" min={1} max={500} className={numCls} value={settings.dailyGoal}
            onChange={(e) => void update('dailyGoal', Math.max(1, Number(e.target.value) || 1))} />
        </Row>
        <Row label="Novos por dia" hint="por tipo de exercício">
          <input aria-label="Novos por dia" type="number" inputMode="numeric" min={0} max={100} className={numCls} value={settings.newPerDay}
            onChange={(e) => void update('newPerDay', Math.max(0, Number(e.target.value) || 0))} />
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

      <h2 className="mb-2 mt-5 text-lg font-bold">Lembretes externos (Telegram)</h2>
      <Card>
        <p className="mb-2 text-sm text-muted">
          Opcional e desligado por padrão. Exige o Worker publicado com TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID (veja DEPLOY.md) e a sincronização ativa.
          No máximo 2 mensagens por dia; nada é enviado se você já estudou.
        </p>
        <Row label="Ativar lembretes">
          <input aria-label="Ativar lembretes" type="checkbox" className="h-7 w-7" checked={settings.remindEnabled} onChange={(e) => void update('remindEnabled', e.target.checked)} />
        </Row>
        <Row label="Horário do lembrete diário">
          <input aria-label="Horário do lembrete" type="time" className="min-h-11 rounded-lg border border-line bg-bg px-3" value={settings.remindTime} onChange={(e) => void update('remindTime', e.target.value || '19:00')} />
        </Row>
        <Row label="Alerta de ofensiva" hint="horas antes do fim do dia">
          <input aria-label="Horas de alerta" type="number" inputMode="numeric" min={1} max={12} className={numCls} value={settings.streakAlertHours}
            onChange={(e) => void update('streakAlertHours', Math.min(12, Math.max(1, Number(e.target.value) || 3)))} />
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
      <p className="mt-4 text-center text-xs text-muted">Conteúdo v{ix.content.v} · {ix.content.lemmas.length} palavras · {ix.content.sentences.length} frases</p>
    </Page>
  );
}
