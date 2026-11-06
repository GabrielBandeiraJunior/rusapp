// Áudio via síntese de voz do navegador (sem custo, sem rede). No iOS só toca após um toque do usuário.
import { stripStress } from '../../shared/russian';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function hasRussianVoice(): boolean {
  if (!speechSupported()) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('ru'));
}

/** Fala o texto em russo. Retorna false se o aparelho não suporta. */
export function speak(text: string, rate = 0.85): boolean {
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(stripStress(text.normalize('NFC')));
  u.lang = 'ru-RU';
  u.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ru'));
  if (voice) u.voice = voice;
  synth.speak(u);
  return true;
}
