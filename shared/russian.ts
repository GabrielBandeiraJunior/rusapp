// Utilidades de texto russo: acento (U+0301), normalização de resposta, transliteração e leitura.
// NENHUMA forma gramatical é gerada aqui — apenas manipulação de strings.

export const ACUTE = '́';
export const VOWELS = 'аеёиоуыэюя';
const VOWEL_SET = new Set(VOWELS.split(''));
const CYR = /[Ѐ-ӿ]/;

export function isVowel(ch: string): boolean {
  return VOWEL_SET.has(ch.toLowerCase());
}

/** Converte a notação do OpenRussian (apóstrofo após a vogal tônica) para U+0301. Retorna null se malformada. */
export function fromApostrophe(s: string): string | null {
  const out: string[] = [];
  const chars = [...s.normalize('NFC')];
  for (const ch of chars) {
    if (ch === "'" || ch === '’') {
      const prev = out[out.length - 1];
      if (!prev || !isVowel(prev)) return null;
      out.push(ACUTE);
    } else out.push(ch);
  }
  return out.join('');
}

export function stripStress(s: string): string {
  return s.normalize('NFC').split(ACUTE).join('').split('̀').join('');
}

export function syllableCount(s: string): number {
  let n = 0;
  for (const ch of stripStress(s).toLowerCase()) if (isVowel(ch)) n++;
  return n;
}

/** Índice (na string SEM marca) da vogal tônica; -1 se não houver marca e não for ё/monossílabo. */
export function stressIndex(s: string): number {
  const chars = [...s.normalize('NFC')];
  let idx = 0;
  let found = -1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ACUTE) continue;
    if (chars[i + 1] === ACUTE) found = idx;
    else if (chars[i].toLowerCase() === 'ё' && found < 0) found = idx;
    idx++;
  }
  if (found < 0 && syllableCount(s) === 1) {
    const plain = [...stripStress(s)];
    found = plain.findIndex(isVowel);
  }
  return found;
}

/** Palavra (token) russa tem acento visível ou é monossílabo? */
export function wordHasRequiredStress(word: string): boolean {
  const n = syllableCount(word);
  if (n <= 1) return true;
  return word.includes(ACUTE) || word.toLowerCase().includes('ё');
}

/** Coloca a marca de acento na vogal de índice `vowelPos` (posição entre as letras, sem marca). */
export function withStressAt(plain: string, pos: number): string {
  const chars = [...stripStress(plain)];
  if (pos < 0 || pos >= chars.length) return chars.join('');
  chars.splice(pos + 1, 0, ACUTE);
  return chars.join('');
}

/** Normalização da resposta digitada: NFC, minúsculas, sem U+0301, ё≡е, espaços colapsados. Exata nas letras. */
export function normalizeAnswer(s: string): string {
  return stripStress(s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ \s]+/g, ' ')
    .trim();
}

export function sameAnswer(a: string, b: string): boolean {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

export function hasCyrillic(s: string): boolean {
  return CYR.test(s);
}

// ---------- Transliteração (esquema BGN simplificado, determinístico) ----------
const T: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ы: 'y', э: 'e', ю: 'yu', я: 'ya', ё: 'yo', ь: "'", ъ: "'",
};

/** Transliteração letra-a-letra. е → "ye" no início, após vogal ou ь/ъ; "e" nos demais casos. */
export function transliterate(word: string): string {
  const chars = [...stripStress(word).toLowerCase()];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === 'е') {
      const prev = chars[i - 1];
      out += !prev || isVowel(prev) || prev === 'ь' || prev === 'ъ' || !CYR.test(prev) ? 'ye' : 'e';
    } else out += T[c] ?? c;
  }
  return out;
}

/** Compara transliterações ignorando apóstrofos/aspas (ь, ъ) e maiúsculas. */
export function normalizeTranslit(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’`"“”ʹʺ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Leitura aproximada (redução vocálica + vozeamento) ----------
const PAIR: Record<string, string> = { б: 'п', в: 'ф', г: 'к', д: 'т', ж: 'ш', з: 'с' };
const UNPAIR: Record<string, string> = { п: 'б', ф: 'в', к: 'г', т: 'д', ш: 'ж', с: 'з' };
const VOICELESS = new Set('пфктшсхцчщ'.split(''));
const VOICED_TRIGGER = new Set('бгджз'.split(''));

/** Respelling aproximado para falantes de pt: redução (о→а, е/я→и átonos), vozeamento, г→в em -ого/-его. */
export function phonetic(word: string): string {
  const stressed = stressIndex(word);
  const chars = [...stripStress(word).toLowerCase()];
  if (/(ого|его)$/.test(chars.join('')) && chars.length > 3) chars[chars.length - 2] = 'в';
  // vozeamento, da direita para a esquerda
  let next: 'end' | 'voiced' | 'voiceless' | 'neutral' = 'end';
  for (let i = chars.length - 1; i >= 0; i--) {
    const c = chars[i];
    if (c === 'ь' || c === 'ъ') continue;
    if (isVowel(c) || !CYR.test(c)) { next = 'neutral'; continue; }
    const paired = c in PAIR || c in UNPAIR;
    if (paired) {
      if (next === 'end' || next === 'voiceless') { if (c in PAIR) chars[i] = PAIR[c]; }
      else if (next === 'voiced') { if (c in UNPAIR) chars[i] = UNPAIR[c]; }
    }
    const cur = chars[i];
    if (VOICELESS.has(cur)) next = 'voiceless';
    else if (VOICED_TRIGGER.has(cur)) next = 'voiced';
    else next = 'neutral';
  }
  // vogais + transliteração
  let out = '';
  let vi = -1;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (isVowel(c)) vi++;
    const prev = chars[i - 1];
    const glide = !prev || isVowel(prev) || prev === 'ь' || prev === 'ъ';
    const tonic = i === stressed || (stressed < 0 && false);
    if (isVowel(c) && !tonic && syllableCount(word) > 1) {
      if (c === 'о' || c === 'а') { out += 'a'; continue; }
      if (c === 'е' || c === 'я') { out += glide ? 'yi' : 'i'; continue; }
    }
    if (c === 'е') out += glide ? 'ye' : 'e';
    else out += T[c] ?? c;
    void vi;
  }
  return out.replace(/'/g, '');
}

/** Palavras (tokens) cirílicas de um texto, preservando acentos. */
export function cyrillicTokens(text: string): string[] {
  return text.normalize('NFC').match(/[Ѐ-ӿ́]+(?:-[Ѐ-ӿ́]+)*/g) ?? [];
}
