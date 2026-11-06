'use client';
import { useEffect, useState } from 'react';
import { stripStress } from '../../shared/russian';

/**
 * Botão de pronúncia usando a voz do navegador (ru-RU). Só fala após o toque do usuário (exigência do iOS).
 * A voz é apenas apoio auditivo: o acento mostrado na tela continua vindo dos dados, nunca da síntese.
 * Não aparece quando o aparelho não tem voz russa.
 */
export function Speak({ text, className = '' }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    const check = () => setOk(synth.getVoices().some((v) => v.lang.toLowerCase().startsWith('ru')));
    check();
    synth.addEventListener?.('voiceschanged', check);
    return () => synth.removeEventListener?.('voiceschanged', check);
  }, []);

  if (!ok) return null;
  const say = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(stripStress(text));
    u.lang = 'ru-RU';
    u.rate = 0.85;
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith('ru'));
    if (v) u.voice = v;
    synth.speak(u);
  };
  return (
    <button type="button" onClick={say} aria-label="Ouvir pronúncia" data-testid="speak"
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-surface align-middle text-lg active:scale-95 ${className}`}>
      🔊
    </button>
  );
}
