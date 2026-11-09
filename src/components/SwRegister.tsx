'use client';
import { useEffect, useRef, useState } from 'react';

/** Registra o service worker e avisa quando há uma versão nova esperando (o usuário decide quando atualizar). */
export function SwRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const updating = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    // só recarrega depois de o usuário tocar em "Atualizar" (na 1ª instalação o SW assume a página sem recarregar)
    const onChange = () => {
      if (updating.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // só há "versão nova" se já existia um controlador (na 1ª instalação não há o que atualizar)
        const watch = (sw: ServiceWorker | null) => {
          if (!sw) return;
          const check = () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
          };
          check();
          sw.addEventListener('statechange', check);
        };
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        void reg.update().catch(() => undefined);
      })
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" data-testid="update-banner" className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-brand p-3 text-white shadow-lg">
      <span className="text-sm font-medium">Nova versão disponível.</span>
      <button
        className="min-h-11 rounded-xl bg-white/20 px-4 font-semibold"
        onClick={() => {
          updating.current = true;
          waiting.postMessage({ type: 'SKIP_WAITING' });
        }}
      >
        Atualizar
      </button>
    </div>
  );
}
