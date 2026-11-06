// Sessão interrompida: guarda a fila e a posição para "continuar de onde parou" (sincroniza entre aparelhos).
import type { QItem } from './queue';
import type { CardKind } from './srs';

const MAX_AGE = 36 * 3600e3;

export type SessionItem = QItem & { retry?: boolean };

export interface SavedSession {
  kind: CardKind;
  /** 'errors' = sessão "Meus erros" (itens de tipos variados) */
  mode?: 'errors';
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
  cloze: 'Casos em frases',
  conj: 'Verbos (conjugação)',
  aspect: 'Verbos (aspecto)',
};

export const KIND_HREF: Record<CardKind, string> = {
  vprod: '/vocabulario/',
  vrec: '/vocabulario/',
  stress: '/vocabulario/',
  gram: '/gramatica/',
  read: '/alfabeto/',
  cloze: '/gramatica/',
  conj: '/verbos/',
  aspect: '/verbos/',
};

export function sessionLabel(s: SavedSession): string {
  return s.mode === 'errors' ? 'Meus erros' : KIND_LABEL[s.kind];
}

export function continueHref(s: SavedSession): string {
  return s.mode === 'errors' ? '/erros/?continue=errors' : `${KIND_HREF[s.kind]}?continue=${s.kind}`;
}

/** Codificação compacta (cabe em 4000 caracteres e viaja pelo sync de ajustes). */
export function encodeSession(s: SavedSession): string {
  return JSON.stringify({
    k: s.kind, m: s.mode ? 'e' : undefined, i: s.idx, s: [s.stats.ok, s.stats.bad], t: s.ts,
    q: s.queue.map((x) => [x.ref, x.isNew ? 1 : 0, x.retry ? 1 : 0, x.kind === s.kind ? '' : x.kind]),
  });
}

export function decodeSession(raw: string, now = Date.now()): SavedSession | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { k: CardKind; m?: string; i: number; s: [number, number]; t: number; q: [string, 0 | 1, 0 | 1, string?][] };
    if (!d || !(d.k in KIND_LABEL) || !Array.isArray(d.q) || typeof d.i !== 'number' || now - d.t > MAX_AGE) return null;
    const queue: SessionItem[] = d.q.map(([ref, n, r, k]) => {
      const kind = (k && k in KIND_LABEL ? k : d.k) as CardKind;
      return { cardId: `${kind}|${ref}`, kind, ref, isNew: !!n, ...(r ? { retry: true } : {}) };
    });
    if (d.i <= 0 || d.i >= queue.length) return null;
    return { kind: d.k, ...(d.m === 'e' ? { mode: 'errors' as const } : {}), queue, idx: d.i, stats: { ok: d.s?.[0] ?? 0, bad: d.s?.[1] ?? 0 }, ts: d.t };
  } catch {
    return null;
  }
}

/** Valor de ?continue= na URL (somente no cliente). */
export function continueParam(): CardKind | 'errors' | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('continue');
  if (v === 'errors') return 'errors';
  return v && v in KIND_LABEL ? (v as CardKind) : null;
}
