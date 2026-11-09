// Sessão interrompida: guarda a fila e a posição para "continuar de onde parou" (por aparelho).
import type { QItem } from './queue';
import type { CardKind } from './srs';

const KEY = 'russo.resume';
const MAX_AGE = 36 * 3600e3;

export type SessionItem = QItem & { retry?: boolean };

export interface SavedSession {
  kind: CardKind;
  queue: SessionItem[];
  idx: number;
  stats: { ok: number; bad: number };
  ts: number;
}

export const KIND_LABEL: Record<CardKind, string> = {
  vprod: 'Vocabulário (digitar)',
  vrec: 'Vocabulário (reconhecer)',
  stress: 'Acento',
  gram: 'Casos',
  read: 'Leitura de palavras',
  verb: 'Verbos (conjugação)',
};

export const KIND_HREF: Record<CardKind, string> = {
  vprod: '/vocabulario/',
  vrec: '/vocabulario/',
  stress: '/vocabulario/',
  gram: '/gramatica/',
  read: '/alfabeto/',
  verb: '/gramatica/',
};

export function continueHref(kind: CardKind): string {
  return `${KIND_HREF[kind]}?continue=${kind}`;
}

export function saveSession(s: SavedSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: apenas não retoma */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadSession(now = Date.now()): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    if (!s || !Array.isArray(s.queue) || typeof s.idx !== 'number' || now - s.ts > MAX_AGE) return null;
    if (s.idx <= 0 || s.idx >= s.queue.length) return null;
    return s;
  } catch {
    return null;
  }
}

/** Valor de ?continue= na URL (somente no cliente). */
export function continueParam(): CardKind | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('continue');
  return v && v in KIND_LABEL ? (v as CardKind) : null;
}
