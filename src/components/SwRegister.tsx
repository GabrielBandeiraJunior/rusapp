'use client';
import { useEffect, useState } from 'react';

/** Registra o service worker e avisa quando uma versão nova assume o controle (sem recarregar no meio da sessão). */
export function SwRegister() {
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    const hadController = !!navigator.serviceWorker.controller; // 1ª instalação não é "atualização"
    const onChange = () => {
      if (hadController) setUpdated(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker.register('/sw.js').then((r) => (reg = r)).catch(() => undefined);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reg?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!updated) return null;
  return (
    <div role="status" data-testid="update-banner"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">
      <span>Nova versão disponível.</span>
      <button className="min-h-11 min-w-11 rounded-xl bg-brand px-4 font-semibold text-white" onClick={() => location.reload()}>
        Recarregar
      </button>
    </div>
  );
}
