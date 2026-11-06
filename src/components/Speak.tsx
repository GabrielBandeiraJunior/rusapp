'use client';
import { useEffect, useState } from 'react';
import { hasRussianVoice, speak, speechSupported } from '@/lib/speech';

/** Botão 🔊: toca o texto em russo. Mostra aviso se o aparelho não tem voz russa. */
export function Speak({ text, className = '' }: { text: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'novoice'>('idle');
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(speechSupported());
    if (speechSupported()) window.speechSynthesis.getVoices(); // algumas engines carregam as vozes sob demanda
  }, []);
  if (!supported) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label="Ouvir a pronúncia"
        data-testid="speak"
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand/10 text-xl active:scale-95 ${className}`}
        onClick={() => setState(speak(text) && !hasRussianVoice() ? 'novoice' : 'idle')}
      >
        🔊
      </button>
      {state === 'novoice' && <span className="text-xs text-muted">Sem voz russa neste aparelho (instale em Ajustes › Idioma).</span>}
    </span>
  );
}
